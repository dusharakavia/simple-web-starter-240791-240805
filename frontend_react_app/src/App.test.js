import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders app header title", () => {
  render(<App />);
  const title = screen.getByRole("heading", { name: /focus dashboard/i });
  expect(title).toBeInTheDocument();
});
