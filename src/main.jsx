import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CatalogPage from "./pages/CatalogPage.jsx";
import BookViewer from "./pages/BookViewer.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Navigate to="/books" replace />} />
        <Route path="/books" element={<CatalogPage />} />
        <Route path="/books/:bookId" element={<BookViewer />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
