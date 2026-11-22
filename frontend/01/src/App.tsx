import { BrowserRouter, Route, Routes } from "react-router-dom";
import Reel from "./components/Reel";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<Reel />} />
      </Routes>
    </BrowserRouter>
  );
}
