import { Chess, makeUci, type Move } from "chessops";
import { parseSan } from "chessops/san";
import type { HumanBotOpeningLine, HumanBotOpeningLineSide } from "./humanBots";

/**
 * Opening lines of the bot catalog (Phase 9.1, I-49), in SAN from the initial position. A line
 * includes the opponent's usual replies: the bot follows it while the game does, and Maia plays
 * once the game leaves it. Hand-written for the first catalog; a later version will measure the
 * lines and their popularity by rating from the Lichess database (Phase 10).
 */
export const BOT_OPENING_LINES = {
    // White: 1.e4 e5
    "ruy-closed": "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3",
    "ruy-berlin": "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8",
    "italian-giuoco": "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 a4",
    "italian-two-knights": "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3",
    "evans-gambit": "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O",
    "scotch-main": "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4",
    "scotch-bc5": "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nb3 Bb6 Nc3 d6 Qe2",
    "four-knights-scotch":
        "e4 e5 Nf3 Nc6 Nc3 Nf6 d4 exd4 Nxd4 Bb4 Nxc6 bxc6 Bd3 d5 exd5 cxd5 O-O O-O",
    "vienna-gambit": "e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7 d4 O-O Bd3",
    "vienna-bc4": "e4 e5 Nc3 Nc6 Bc4 Nf6 d3 Bc5 f4 d6 Nf3",
    "kings-gambit": "e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6 Bc4 d5 exd5 Bd6",
    "vs-petrov": "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6 O-O Be7 c4",
    "vs-philidor": "e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 O-O O-O",
    // White: against the Sicilian
    "open-sicilian-najdorf": "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3",
    "open-sicilian-dragon": "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4",
    "open-sicilian-nc6": "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5",
    "open-sicilian-e6": "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 Qd2",
    alapin: "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4 Nb6 Bb5",
    "alapin-d5": "e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 e6 Be2 Nc6 O-O",
    "grand-prix": "e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bc4 e6 f5",
    "smith-morra": "e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4 e6 O-O Nf6 Qe2 Be7 Rd1",
    rossolimo: "e4 c5 Nf3 Nc6 Bb5 g6 O-O Bg7 Re1 e5 Bxc6 dxc6 d3",
    moscow: "e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7 c4 Nc6 Nc3 Nf6 d4",
    // White: against the French, the Caro-Kann and others
    "french-tarrasch": "e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2",
    "french-advance": "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4 Nbd2",
    "french-winawer": "e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4",
    "french-exchange": "e4 e6 d4 d5 exd5 exd5 Nf3 Nf6 Bd3 Bd6 O-O O-O",
    "french-classical": "e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4",
    "caro-advance": "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3",
    "caro-classical": "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3",
    "caro-exchange": "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3",
    "caro-two-knights": "e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6 d4",
    "scandinavian-qa5": "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5",
    "scandinavian-qd6": "e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 a6 Be2",
    "pirc-150": "e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5",
    "pirc-classical": "e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6 a4",
    "vs-modern": "e4 g6 d4 Bg7 Nc3 d6 Be3 a6 Qd2 Nd7 f4",
    "alekhine-modern": "e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O",
    // White: 1.d4
    "qgd-main": "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6",
    "qgd-exchange": "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 Be7 e3 c6 Bd3 O-O Qc2",
    "vs-qga": "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6",
    "vs-slav": "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O",
    "vs-semi-slav": "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Qc2 Bd6 Bd3",
    "vs-kid-classical": "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7",
    "vs-kid-samisch": "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5 d5",
    "vs-nimzo-e3": "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O",
    "vs-nimzo-qc2": "d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5",
    "vs-qid": "d4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7 Bg2 c6 O-O",
    "vs-grunfeld-exchange": "d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Be3",
    "vs-benoni": "d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7 Be2 O-O O-O",
    "vs-benko": "d4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6 Nc3 d6 e4 Bxf1 Kxf1 g6",
    "vs-dutch": "d4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6 Nc3",
    "catalan-open": "d4 Nf6 c4 e6 g3 d5 Bg2 dxc4 Nf3 a6 O-O b5 Ne5",
    "catalan-closed": "d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7",
    "catalan-vs-d5": "d4 d5 c4 e6 Nf3 Nf6 g3 Be7 Bg2 O-O O-O dxc4 Qc2",
    "london-vs-d5": "d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3",
    "london-vs-g6": "d4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3 c5 c3",
    "london-vs-e6": "d4 Nf6 Nf3 e6 Bf4 b6 e3 Bb7 h3 Be7 Bd3 c5 c3 O-O Nbd2",
    "colle-zukertort": "d4 d5 Nf3 Nf6 e3 e6 Bd3 c5 b3 Nc6 O-O Bd6 Bb2 O-O Nbd2",
    "colle-zukertort-g6": "d4 Nf6 Nf3 g6 e3 Bg7 Bd3 O-O O-O d6 b3 Nbd7 Bb2",
    "colle-classic": "d4 d5 Nf3 Nf6 e3 e6 Bd3 c5 c3 Nc6 Nbd2 Bd6 O-O O-O dxc5 Bxc5 e4",
    trompowsky: "d4 Nf6 Bg5 Ne4 Bf4 c5 f3 Qa5+ c3 Nf6 d5",
    "trompowsky-e6": "d4 Nf6 Bg5 e6 e4 h6 Bxf6 Qxf6 Nf3 d6 Nc3",
    jobava: "d4 d5 Nc3 Nf6 Bf4 e6 Nb5 Na6 e3 Be7 Nf3",
    "blackmar-diemer": "d4 d5 e4 dxe4 Nc3 Nf6 f3 exf3 Nxf3 Bg4 h3 Bxf3 Qxf3 c6 Be3",
    // White: flank openings
    "english-reversed": "c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6 Nf3 Nc6 O-O Be7 d3",
    "english-symmetrical": "c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 e6 O-O Nge7 d3 O-O",
    "english-nf6": "c4 Nf6 Nc3 e6 Nf3 d5 d4 Be7 Bf4 O-O e3",
    "english-e6": "c4 e6 Nc3 d5 d4 Nf6 Nf3 Be7 Bg5 h6 Bh4",
    "english-g6": "c4 g6 Nc3 Bg7 g3 d6 Bg2 e5 d3 Nc6 Rb1",
    "reti-g3-d5": "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3 Nbd7 Nbd2 e5 e4",
    "reti-g3-nf6": "Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O d3 d6 e4 e5 Nc3",
    "reti-c4-d5": "Nf3 d5 c4 e6 g3 Nf6 Bg2 Be7 O-O O-O b3 c5 Bb2 Nc6 e3",
    "reti-c4-dxc4": "Nf3 d5 c4 dxc4 e3 Nf6 Bxc4 e6 O-O c5 b3",
    "reti-c4-nf6": "Nf3 Nf6 c4 g6 b3 Bg7 Bb2 O-O g3 d6 Bg2 e5 d3",
    // Black: against 1.e4
    "najdorf-be3": "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O",
    "najdorf-bg5": "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Be7 Qf3 Qc7 O-O-O Nbd7",
    "najdorf-be2": "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7 O-O O-O Be3 Be6",
    "dragon-yugoslav":
        "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O Rc8",
    "accelerated-dragon": "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4 Bg7 Be3 Nf6 Nc3 O-O Be2 d6 O-O Bd7",
    sveshnikov: "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Bxf6 gxf6 Nd5 f5",
    taimanov: "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 Qd2 Nf6 O-O-O Bb4",
    kan: "e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Nf6 O-O Qc7 Qe2 d6 c4 g6",
    "sicilian-vs-alapin": "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4 Nb6 Bb5 dxe5",
    "sicilian-vs-alapin-d5": "e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 Bg4 Be2 e6 O-O Nc6",
    "sicilian-vs-rossolimo": "e4 c5 Nf3 Nc6 Bb5 g6 O-O Bg7 Re1 e5 Bxc6 dxc6 d3 Qe7",
    "sicilian-vs-moscow": "e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7 c4 Nc6 Nc3 g6 d4 cxd4 Nxd4 Bg7",
    "sicilian-vs-grand-prix": "e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bc4 e6 f5 Nge7",
    "sicilian-vs-smith-morra": "e4 c5 d4 cxd4 c3 Nf6 e5 Nd5 cxd4 d6 Nf3 Nc6 Bc4 Nb6",
    "french-winawer-black":
        "e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 Qc7 Qxg7 Rg8 Qxh7 cxd4",
    "french-classical-black": "e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5",
    "french-rubinstein": "e4 e6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Nf3 Ngf6 Nxf6+ Nxf6 Bd3 c5",
    "french-vs-advance": "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4 Nbd2 Na5",
    "french-vs-tarrasch": "e4 e6 d4 d5 Nd2 c5 exd5 Qxd5 Ngf3 cxd4 Bc4 Qd6 O-O Nf6",
    "french-vs-exchange": "e4 e6 d4 d5 exd5 exd5 Nf3 Bd6 Bd3 Ne7 O-O O-O",
    "caro-classical-black":
        "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6",
    "caro-vs-advance": "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Nd7 O-O Ne7",
    "caro-vs-exchange": "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3 Qd7",
    "caro-vs-panov": "e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7 cxd5 Nxd5",
    "caro-vs-two-knights": "e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6 d4 Nf6 Bd3 dxe4 Nxe4",
    "ruy-closed-black": "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5",
    "ruy-berlin-black": "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8",
    "e5-vs-italian": "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O a6 a4 O-O Re1 Ba7",
    "e5-vs-italian-ng5":
        "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3 e4 Ne5 Bd6",
    "two-knights-black": "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3 Na5 Bb5 a6",
    "e5-vs-scotch": "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Ba6",
    "e5-vs-vienna": "e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7 d4 O-O",
    "e5-vs-kings-gambit": "e4 e5 f4 exf4 Nf3 d5 exd5 Nf6 Bb5+ c6 dxc6 Nxc6",
    "petrov-black": "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6 O-O Be7 c4 Nb4",
    "philidor-black": "e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 O-O O-O a4 c6",
    "scandinavian-qa5-black": "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6",
    "scandinavian-qd6-black": "e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 a6 Be2 Nc6 O-O Bf5",
    "scandinavian-nf6-black": "e4 d5 exd5 Nf6 d4 Nxd5 Nf3 g6 Be2 Bg7 O-O O-O c4 Nb6",
    "pirc-black": "e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5 g4 Nbd7",
    "pirc-vs-classical": "e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6 a4 Nbd7",
    "modern-black": "e4 g6 d4 Bg7 Nc3 d6 Be3 a6 Qd2 Nd7 f4 b5 Nf3 Bb7",
    "alekhine-black": "e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O Be7 c4 Nb6",
    // Black: against 1.d4
    "qgd-black": "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5",
    "qgd-vs-exchange": "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 Be7 e3 c6 Bd3 O-O Qc2 Nbd7",
    "d5-vs-london": "d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O",
    "d5-vs-colle": "d4 d5 Nf3 Nf6 e3 e6 Bd3 c5 b3 Nc6 O-O Bd6 Bb2 O-O",
    "slav-black": "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O Qe2 Nbd7",
    "slav-vs-exchange": "d4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Bf4 Nc6 e3 Bf5 Nf3 e6",
    "semi-slav-black": "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Qc2 Bd6 Bd3 O-O O-O dxc4 Bxc4 b5",
    "qga-black": "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 dxc5 Qxd1 Rxd1 Bxc5",
    "e6-vs-catalan": "d4 Nf6 c4 e6 g3 d5 Bg2 dxc4 Nf3 a6 O-O b5 Ne5 Nd5",
    "nimzo-black": "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3 dxc4 Bxc4 Qc7",
    "nimzo-vs-qc2": "d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7",
    "qid-black": "d4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7 Bg2 c6 O-O d5",
    "e6-vs-london": "d4 Nf6 Bf4 e6 e3 c5 c3 Nc6 Nd2 d5 Ngf3 Bd6",
    "e6-vs-trompowsky": "d4 Nf6 Bg5 e6 e4 h6 Bxf6 Qxf6 Nf3 d6 Nc3 Nd7",
    "kid-black": "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7",
    "kid-vs-samisch": "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5 d5 Nh5 Qd2 f5",
    "kid-vs-fianchetto": "d4 Nf6 c4 g6 Nf3 Bg7 g3 O-O Bg2 d6 O-O Nbd7 Nc3 e5 e4",
    "kid-vs-london": "d4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3 c5 c3 Qb6",
    "kid-vs-colle": "d4 Nf6 Nf3 g6 e3 Bg7 Bd3 O-O O-O d6 b3 e5",
    "grunfeld-black": "d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Be3 Qa5 Qd2 O-O",
    "grunfeld-vs-qb3": "d4 Nf6 c4 g6 Nc3 d5 Nf3 Bg7 Qb3 dxc4 Qxc4 O-O e4 a6",
    "benoni-black": "d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7 Be2 O-O O-O Re8",
    "benko-black": "d4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6 Nc3 d6 e4 Bxf1 Kxf1 g6 g3 Bg7 Kg2 O-O",
    "dutch-leningrad": "d4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6 Nc3 Qe8",
    "dutch-stonewall": "d4 e6 c4 f5 g3 Nf6 Bg2 d5 Nf3 c6 O-O Bd6 b3 Qe7",
    "albin-black": "d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3 Be6 Nbd2 Qd7 Bg2 O-O-O",
    "chigorin-black": "d4 d5 c4 Nc6 Nc3 dxc4 Nf3 Nf6 e4 Bg4 Be3 e6",
    // Black: against flank openings
    "vs-english-e5": "c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6 Nf3 Nc6",
    "vs-english-c5": "c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 e6 O-O Nge7",
    "vs-english-nf6": "c4 Nf6 Nc3 e6 e4 d5 e5 Ne4 Nf3 Nc6",
    "vs-english-g6": "c4 g6 Nc3 Bg7 g3 c5 Bg2 Nc6 Nf3 e6 O-O Nge7",
    "vs-reti-d5": "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3 Nbd7 Nbd2 e5",
    "vs-reti-nf6": "Nf3 Nf6 c4 g6 Nc3 Bg7 e4 d6 d4 O-O",
    "vs-reti-c4-e6": "Nf3 d5 c4 e6 g3 Nf6 Bg2 Be7 O-O O-O b3 c5",
} as const;

export type BotOpeningLineId = keyof typeof BOT_OPENING_LINES;

/** Where a family is used: the bot's own first moves with White, or its defenses with Black. */
export type BotOpeningFamilyKind = "white" | "vsE4" | "vsD4" | "vsFlank";

export type BotOpeningFamily = {
    kind: BotOpeningFamilyKind;
    /** English name; the interface translates it with `HumanBots.Family.<id>`. */
    name: string;
    lines: readonly (readonly [BotOpeningLineId, number])[];
};

/** Sets of lines a bot adopts as a whole, with their weights. */
export const BOT_OPENING_FAMILIES = {
    // White
    ruy: {
        kind: "white",
        name: "Ruy Lopez and Open Sicilian",
        lines: [
            ["ruy-closed", 5],
            ["ruy-berlin", 3],
            ["vs-petrov", 1],
            ["vs-philidor", 1],
            ["open-sicilian-najdorf", 3],
            ["open-sicilian-dragon", 2],
            ["open-sicilian-nc6", 2],
            ["open-sicilian-e6", 2],
            ["french-tarrasch", 3],
            ["caro-advance", 3],
            ["scandinavian-qa5", 2],
            ["pirc-150", 2],
            ["vs-modern", 1],
            ["alekhine-modern", 1],
        ],
    },
    italian: {
        kind: "white",
        name: "Italian and Alapin",
        lines: [
            ["italian-giuoco", 5],
            ["italian-two-knights", 3],
            ["vs-petrov", 1],
            ["vs-philidor", 1],
            ["alapin", 3],
            ["alapin-d5", 2],
            ["french-advance", 3],
            ["caro-two-knights", 3],
            ["scandinavian-qd6", 2],
            ["pirc-classical", 2],
            ["vs-modern", 1],
        ],
    },
    scotch: {
        kind: "white",
        name: "Scotch and Open Sicilian",
        lines: [
            ["scotch-main", 4],
            ["scotch-bc5", 3],
            ["four-knights-scotch", 2],
            ["vs-petrov", 1],
            ["open-sicilian-najdorf", 3],
            ["open-sicilian-nc6", 2],
            ["open-sicilian-e6", 2],
            ["french-winawer", 3],
            ["caro-classical", 3],
            ["scandinavian-qa5", 2],
            ["pirc-150", 2],
        ],
    },
    vienna: {
        kind: "white",
        name: "Vienna and Grand Prix",
        lines: [
            ["vienna-gambit", 4],
            ["vienna-bc4", 3],
            ["grand-prix", 4],
            ["french-classical", 3],
            ["caro-two-knights", 3],
            ["scandinavian-qa5", 2],
            ["pirc-classical", 2],
        ],
    },
    gambits: {
        kind: "white",
        name: "King's Gambit and Smith-Morra",
        lines: [
            ["kings-gambit", 4],
            ["evans-gambit", 3],
            ["smith-morra", 4],
            ["french-advance", 3],
            ["caro-advance", 3],
            ["scandinavian-qa5", 2],
            ["pirc-150", 2],
        ],
    },
    "e4-practical": {
        kind: "white",
        name: "Italian and Rossolimo",
        lines: [
            ["italian-giuoco", 5],
            ["vs-philidor", 1],
            ["rossolimo", 3],
            ["moscow", 3],
            ["french-exchange", 3],
            ["caro-exchange", 3],
            ["scandinavian-qd6", 2],
            ["pirc-classical", 2],
        ],
    },
    "queens-gambit": {
        kind: "white",
        name: "Queen's Gambit",
        lines: [
            ["qgd-main", 4],
            ["qgd-exchange", 2],
            ["vs-qga", 2],
            ["vs-slav", 3],
            ["vs-semi-slav", 2],
            ["vs-kid-classical", 3],
            ["vs-nimzo-e3", 3],
            ["vs-qid", 2],
            ["vs-grunfeld-exchange", 2],
            ["vs-benoni", 1],
            ["vs-benko", 1],
            ["vs-dutch", 1],
        ],
    },
    "queens-gambit-sharp": {
        kind: "white",
        name: "Queen's Gambit, sharp lines",
        lines: [
            ["qgd-exchange", 3],
            ["vs-qga", 2],
            ["vs-slav", 3],
            ["vs-kid-samisch", 3],
            ["vs-nimzo-qc2", 3],
            ["vs-grunfeld-exchange", 3],
            ["vs-benoni", 2],
            ["vs-benko", 1],
        ],
    },
    catalan: {
        kind: "white",
        name: "Catalan",
        lines: [
            ["catalan-open", 3],
            ["catalan-closed", 3],
            ["catalan-vs-d5", 3],
            ["vs-qid", 2],
            ["kid-vs-fianchetto", 2],
            ["vs-dutch", 1],
        ],
    },
    london: {
        kind: "white",
        name: "London System",
        lines: [
            ["london-vs-d5", 5],
            ["london-vs-g6", 3],
            ["london-vs-e6", 3],
        ],
    },
    colle: {
        kind: "white",
        name: "Colle-Zukertort",
        lines: [
            ["colle-zukertort", 4],
            ["colle-classic", 2],
            ["colle-zukertort-g6", 3],
        ],
    },
    "d4-adventurous": {
        kind: "white",
        name: "Trompowsky, Jobava and Blackmar-Diemer",
        lines: [
            ["trompowsky", 3],
            ["trompowsky-e6", 2],
            ["jobava", 3],
            ["blackmar-diemer", 2],
        ],
    },
    english: {
        kind: "white",
        name: "English Opening",
        lines: [
            ["english-reversed", 4],
            ["english-symmetrical", 3],
            ["english-nf6", 3],
            ["english-e6", 2],
            ["english-g6", 2],
        ],
    },
    "reti-g3": {
        kind: "white",
        name: "Réti with g3",
        lines: [
            ["reti-g3-d5", 4],
            ["reti-g3-nf6", 3],
        ],
    },
    "reti-c4": {
        kind: "white",
        name: "Réti with c4",
        lines: [
            ["reti-c4-d5", 4],
            ["reti-c4-dxc4", 2],
            ["reti-c4-nf6", 3],
        ],
    },
    // Black against 1.e4
    najdorf: {
        kind: "vsE4",
        name: "Sicilian Najdorf",
        lines: [
            ["najdorf-be3", 4],
            ["najdorf-bg5", 2],
            ["najdorf-be2", 2],
            ["sicilian-vs-alapin", 2],
            ["sicilian-vs-moscow", 2],
            ["sicilian-vs-grand-prix", 1],
            ["sicilian-vs-smith-morra", 1],
        ],
    },
    dragon: {
        kind: "vsE4",
        name: "Sicilian Dragon",
        lines: [
            ["dragon-yugoslav", 4],
            ["sicilian-vs-alapin", 2],
            ["sicilian-vs-moscow", 2],
            ["sicilian-vs-grand-prix", 1],
            ["sicilian-vs-smith-morra", 1],
        ],
    },
    "accelerated-dragon": {
        kind: "vsE4",
        name: "Accelerated Dragon",
        lines: [
            ["accelerated-dragon", 4],
            ["sicilian-vs-rossolimo", 2],
            ["sicilian-vs-alapin-d5", 2],
            ["sicilian-vs-grand-prix", 1],
        ],
    },
    sveshnikov: {
        kind: "vsE4",
        name: "Sicilian Sveshnikov",
        lines: [
            ["sveshnikov", 4],
            ["sicilian-vs-rossolimo", 2],
            ["sicilian-vs-alapin", 2],
            ["sicilian-vs-grand-prix", 1],
            ["sicilian-vs-smith-morra", 1],
        ],
    },
    taimanov: {
        kind: "vsE4",
        name: "Sicilian Taimanov and Kan",
        lines: [
            ["taimanov", 3],
            ["kan", 3],
            ["sicilian-vs-alapin-d5", 2],
            ["sicilian-vs-grand-prix", 1],
            ["sicilian-vs-smith-morra", 1],
        ],
    },
    "french-winawer": {
        kind: "vsE4",
        name: "French Winawer",
        lines: [
            ["french-winawer-black", 4],
            ["french-vs-advance", 3],
            ["french-vs-tarrasch", 2],
            ["french-vs-exchange", 2],
        ],
    },
    "french-classical": {
        kind: "vsE4",
        name: "Classical French",
        lines: [
            ["french-classical-black", 4],
            ["french-vs-advance", 3],
            ["french-vs-tarrasch", 2],
            ["french-vs-exchange", 2],
        ],
    },
    "french-rubinstein": {
        kind: "vsE4",
        name: "French Rubinstein",
        lines: [
            ["french-rubinstein", 4],
            ["french-vs-advance", 3],
            ["french-vs-tarrasch", 2],
            ["french-vs-exchange", 2],
        ],
    },
    "caro-kann": {
        kind: "vsE4",
        name: "Caro-Kann",
        lines: [
            ["caro-classical-black", 4],
            ["caro-vs-advance", 3],
            ["caro-vs-exchange", 2],
            ["caro-vs-panov", 2],
            ["caro-vs-two-knights", 2],
        ],
    },
    "ruy-defense": {
        kind: "vsE4",
        name: "Closed Ruy Lopez",
        lines: [
            ["ruy-closed-black", 4],
            ["e5-vs-italian", 3],
            ["e5-vs-scotch", 2],
            ["e5-vs-vienna", 1],
            ["e5-vs-kings-gambit", 1],
        ],
    },
    berlin: {
        kind: "vsE4",
        name: "Berlin Defense",
        lines: [
            ["ruy-berlin-black", 4],
            ["e5-vs-italian", 3],
            ["e5-vs-scotch", 2],
            ["e5-vs-vienna", 1],
            ["e5-vs-kings-gambit", 1],
        ],
    },
    "two-knights": {
        kind: "vsE4",
        name: "Two Knights Defense",
        lines: [
            ["two-knights-black", 3],
            ["e5-vs-italian-ng5", 3],
            ["ruy-closed-black", 2],
            ["e5-vs-scotch", 2],
            ["e5-vs-vienna", 1],
            ["e5-vs-kings-gambit", 1],
        ],
    },
    petrov: {
        kind: "vsE4",
        name: "Petrov Defense",
        lines: [
            ["petrov-black", 4],
            ["e5-vs-vienna", 1],
            ["e5-vs-kings-gambit", 1],
        ],
    },
    philidor: {
        kind: "vsE4",
        name: "Philidor Defense",
        lines: [
            ["philidor-black", 4],
            ["e5-vs-vienna", 1],
            ["e5-vs-kings-gambit", 1],
        ],
    },
    scandinavian: {
        kind: "vsE4",
        name: "Scandinavian",
        lines: [
            ["scandinavian-qa5-black", 3],
            ["scandinavian-qd6-black", 3],
            ["scandinavian-nf6-black", 1],
        ],
    },
    pirc: {
        kind: "vsE4",
        name: "Pirc Defense",
        lines: [
            ["pirc-black", 3],
            ["pirc-vs-classical", 3],
        ],
    },
    modern: { kind: "vsE4", name: "Modern Defense", lines: [["modern-black", 4]] },
    alekhine: { kind: "vsE4", name: "Alekhine Defense", lines: [["alekhine-black", 4]] },
    // Black against 1.d4
    qgd: {
        kind: "vsD4",
        name: "Queen's Gambit Declined",
        lines: [
            ["qgd-black", 4],
            ["qgd-vs-exchange", 2],
            ["d5-vs-london", 2],
            ["d5-vs-colle", 2],
        ],
    },
    slav: {
        kind: "vsD4",
        name: "Slav Defense",
        lines: [
            ["slav-black", 4],
            ["slav-vs-exchange", 2],
            ["d5-vs-london", 2],
            ["d5-vs-colle", 1],
        ],
    },
    "semi-slav": {
        kind: "vsD4",
        name: "Semi-Slav",
        lines: [
            ["semi-slav-black", 4],
            ["slav-vs-exchange", 2],
            ["d5-vs-london", 2],
        ],
    },
    qga: {
        kind: "vsD4",
        name: "Queen's Gambit Accepted",
        lines: [
            ["qga-black", 4],
            ["d5-vs-london", 2],
            ["d5-vs-colle", 1],
        ],
    },
    nimzo: {
        kind: "vsD4",
        name: "Nimzo-Indian and Queen's Indian",
        lines: [
            ["nimzo-black", 4],
            ["nimzo-vs-qc2", 2],
            ["qid-black", 3],
            ["e6-vs-catalan", 2],
            ["e6-vs-london", 2],
            ["e6-vs-trompowsky", 1],
        ],
    },
    "kings-indian": {
        kind: "vsD4",
        name: "King's Indian Defense",
        lines: [
            ["kid-black", 5],
            ["kid-vs-samisch", 2],
            ["kid-vs-fianchetto", 2],
            ["kid-vs-london", 2],
            ["kid-vs-colle", 1],
        ],
    },
    grunfeld: {
        kind: "vsD4",
        name: "Grünfeld Defense",
        lines: [
            ["grunfeld-black", 4],
            ["grunfeld-vs-qb3", 2],
            ["kid-vs-london", 2],
            ["kid-vs-colle", 1],
        ],
    },
    benoni: {
        kind: "vsD4",
        name: "Modern Benoni",
        lines: [
            ["benoni-black", 4],
            ["e6-vs-trompowsky", 1],
            ["kid-vs-london", 2],
        ],
    },
    benko: {
        kind: "vsD4",
        name: "Benko Gambit",
        lines: [
            ["benko-black", 4],
            ["kid-vs-london", 2],
        ],
    },
    dutch: {
        kind: "vsD4",
        name: "Dutch Defense",
        lines: [
            ["dutch-leningrad", 3],
            ["dutch-stonewall", 3],
        ],
    },
    albin: {
        kind: "vsD4",
        name: "Albin Countergambit",
        lines: [
            ["albin-black", 4],
            ["d5-vs-london", 2],
        ],
    },
    chigorin: {
        kind: "vsD4",
        name: "Chigorin Defense",
        lines: [
            ["chigorin-black", 4],
            ["d5-vs-london", 2],
        ],
    },
    // Black against flank openings
    "flank-e5": {
        kind: "vsFlank",
        name: "1...e5 and 1...d5 against flank openings",
        lines: [
            ["vs-english-e5", 3],
            ["vs-reti-d5", 3],
        ],
    },
    "flank-c5": {
        kind: "vsFlank",
        name: "Symmetrical against flank openings",
        lines: [
            ["vs-english-c5", 3],
            ["vs-reti-c4-e6", 3],
        ],
    },
    "flank-nf6": {
        kind: "vsFlank",
        name: "1...Nf6 against flank openings",
        lines: [
            ["vs-english-nf6", 3],
            ["vs-reti-nf6", 3],
        ],
    },
    "flank-g6": {
        kind: "vsFlank",
        name: "Fianchetto against flank openings",
        lines: [
            ["vs-english-g6", 3],
            ["vs-reti-nf6", 3],
        ],
    },
} as const satisfies Record<string, BotOpeningFamily>;

export type BotOpeningFamilyId = keyof typeof BOT_OPENING_FAMILIES;

const uciCache = new Map<BotOpeningLineId, string[]>();

/** UCI moves of a line; castling is written as the king's two-square move, as engines expect. */
export function botOpeningLineUci(id: BotOpeningLineId): string[] {
    const cached = uciCache.get(id);
    if (cached) return cached;
    const position = Chess.default();
    const moves = BOT_OPENING_LINES[id].split(" ").map((san) => {
        const move = parseSan(position, san);
        if (!move) throw new Error(`Opening line ${id}: illegal move ${san}`);
        const uci = standardCastlingUci(position, move);
        position.play(move);
        return uci;
    });
    uciCache.set(id, moves);
    return moves;
}

function standardCastlingUci(position: Chess, move: Move): string {
    const uci = makeUci(move);
    if (!("from" in move) || position.board.get(move.from)?.role !== "king") return uci;
    const castles: Record<string, string> = {
        e1h1: "e1g1",
        e1a1: "e1c1",
        e8h8: "e8g8",
        e8a8: "e8c8",
    };
    return castles[uci] ?? uci;
}

/** The lines of a family for a bot's repertoire, on the side it uses them. */
export function botFamilyLines(id: BotOpeningFamilyId): HumanBotOpeningLine[] {
    const family: BotOpeningFamily = BOT_OPENING_FAMILIES[id];
    const side: HumanBotOpeningLineSide = family.kind === "white" ? "white" : "black";
    return family.lines.map(([line, weight]) => ({
        id: line,
        moves: botOpeningLineUci(line),
        weight,
        side,
    }));
}
