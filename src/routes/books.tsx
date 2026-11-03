import { createFileRoute } from "@tanstack/react-router";
import BooksPage from "@/components/books/BooksPage";

export const Route = createFileRoute("/books")({
  component: BooksPage,
});
