// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Table, TableBody, TableCell, TableRow } from "./table";

describe("Table", () => {
  afterEach(cleanup);

  it("makes its horizontal scroll region keyboard reachable, covers: AC-6", () => {
    render(<Table containerLabel="Attendance records"><TableBody><TableRow><TableCell>Record</TableCell></TableRow></TableBody></Table>);
    expect(screen.getByRole("region", { name: "Attendance records" })).toHaveAttribute("tabindex", "0");
  });
});
