use axum::{
    extract::Query, http::StatusCode, response::IntoResponse, routing::get, Extension, Router,
};
use log::{info, warn};
use oauth2::{
    basic::BasicClient, reqwest::async_http_client, AuthUrl, AuthorizationCode, ClientId,
    CsrfToken, PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use serde::Deserialize;
use std::{net::TcpListener, time::Duration};
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::{oneshot, Mutex};

use crate::{error::Error, AppState};

const AUTH_TIMEOUT: Duration = Duration::from_secs(5 * 60);

fn create_client(redirect_url: RedirectUrl) -> Result<BasicClient, Error> {
    let client_id = ClientId::new("org.encroissant.app".to_string());
    let auth_url = AuthUrl::new("https://lichess.org/oauth".to_string())
        .map_err(|error| Error::OAuth(error.to_string()))?;
    let token_url = TokenUrl::new("https://lichess.org/api/token".to_string())
        .map_err(|error| Error::OAuth(error.to_string()))?;

    Ok(BasicClient::new(client_id, None, auth_url, Some(token_url)).set_redirect_uri(redirect_url))
}

struct PendingAuth {
    csrf_token: CsrfToken,
    pkce_verifier: String,
    client: BasicClient,
    shutdown: Option<oneshot::Sender<()>>,
}

#[derive(Default)]
pub struct AuthState {
    pending: Mutex<Option<PendingAuth>>,
}

#[tauri::command]
#[specta::specta]
pub async fn authenticate(
    username: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), Error> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    listener.set_nonblocking(true)?;
    let socket_addr = listener.local_addr()?;
    let redirect_url = RedirectUrl::new(format!("http://{socket_addr}/callback"))
        .map_err(|error| Error::OAuth(error.to_string()))?;
    let client = create_client(redirect_url)?;
    let csrf_token = CsrfToken::new_random();
    let attempt_state = csrf_token.secret().to_string();
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    let (shutdown_tx, shutdown_rx) = oneshot::channel();

    let (auth_url, _) = client
        .authorize_url(|| csrf_token.clone())
        .add_scope(Scope::new("preference:read".to_string()))
        .add_extra_param("username", username.trim())
        .set_pkce_challenge(pkce_challenge)
        .url();

    {
        let mut pending = state.auth.pending.lock().await;
        if pending.is_some() {
            return Err(Error::OAuth(
                "A Lichess authentication attempt is already active".to_string(),
            ));
        }
        *pending = Some(PendingAuth {
            csrf_token,
            pkce_verifier: PkceCodeVerifier::secret(&pkce_verifier).to_string(),
            client,
            shutdown: Some(shutdown_tx),
        });
    }

    let server_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let server = run_server(server_app.clone(), listener, shutdown_rx);
        tokio::select! {
            result = server => {
                if let Err(error) = result {
                    warn!("Lichess OAuth callback server failed: {error}");
                }
            }
            _ = tokio::time::sleep(AUTH_TIMEOUT) => {
                warn!("Lichess OAuth attempt expired before receiving a callback");
            }
        }
        let state = server_app.state::<AppState>();
        let mut pending = state.auth.pending.lock().await;
        if pending
            .as_ref()
            .is_some_and(|pending| pending.csrf_token.secret() == &attempt_state)
        {
            *pending = None;
        }
    });

    if let Err(error) = app.opener().open_url(auth_url.as_str(), None::<&str>) {
        let mut pending = state.auth.pending.lock().await;
        if let Some(mut pending) = pending.take() {
            if let Some(shutdown) = pending.shutdown.take() {
                let _ = shutdown.send(());
            }
        }
        return Err(error.into());
    }

    info!("Started a one-time Lichess OAuth attempt");
    Ok(())
}

#[derive(Deserialize)]
struct CallbackQuery {
    code: AuthorizationCode,
    state: CsrfToken,
}

async fn authorize(
    app: Extension<tauri::AppHandle>,
    query: Query<CallbackQuery>,
) -> impl IntoResponse {
    let pending = {
        let state = app.state::<AppState>();
        let mut guard = state.auth.pending.lock().await;
        let valid_state = guard
            .as_ref()
            .is_some_and(|pending| query.state.secret() == pending.csrf_token.secret());
        if !valid_state {
            warn!("Rejected a Lichess OAuth callback with an invalid or expired state");
            return (
                StatusCode::UNAUTHORIZED,
                "The authentication request is invalid or expired. Return to Onyx and try again.",
            );
        }
        guard.take().expect("validated pending OAuth state")
    };

    let result = pending
        .client
        .exchange_code(query.code.clone())
        .set_pkce_verifier(PkceCodeVerifier::new(pending.pkce_verifier))
        .request_async(async_http_client)
        .await;

    if let Some(shutdown) = pending.shutdown {
        let _ = shutdown.send(());
    }

    match result {
        Ok(token) => {
            if let Err(error) = app.emit("access_token", token.access_token().secret()) {
                warn!("Could not deliver the Lichess token to the application: {error}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Lichess authorized the request, but Onyx could not finish the login.",
                );
            }
            (
                StatusCode::OK,
                "Authentication completed. You can close this page and return to Onyx.",
            )
        }
        Err(error) => {
            warn!("Lichess OAuth token exchange failed: {error}");
            (
                StatusCode::BAD_GATEWAY,
                "Lichess could not complete the authentication. Return to Onyx and try again.",
            )
        }
    }
}

async fn run_server(
    handle: tauri::AppHandle,
    listener: TcpListener,
    shutdown: oneshot::Receiver<()>,
) -> Result<(), Error> {
    let router = Router::new()
        .route("/callback", get(authorize))
        .layer(Extension(handle));

    axum::Server::from_tcp(listener)
        .map_err(|error| Error::OAuth(error.to_string()))?
        .serve(router.into_make_service())
        .with_graceful_shutdown(async {
            let _ = shutdown.await;
        })
        .await
        .map_err(|error| Error::OAuth(error.to_string()))
}
