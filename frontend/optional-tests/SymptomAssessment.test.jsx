import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("../src/lib/AuthContext.jsx", () => ({ useAuth: () => ({ accessToken: "tok", user: { email: "p@x.com" }, logout: vi.fn() }) }));
vi.mock("../src/lib/api.js", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "../src/lib/api.js";
import SymptomAssessment from "../src/pages/SymptomAssessment.jsx";

const CATALOGUE = { symptoms: [
  { key: "headache", label: "Headache" }, { key: "nausea", label: "Nausea" }, { key: "dizziness", label: "Dizziness" },
  { key: "chest_pain", label: "Chest pain" }, { key: "toxic_look_(typhos)", label: "Toxic look (typhos)" } ], minSymptoms: 3, maxSymptoms: 4 };
const OK = { status: "ok", matchStrength: "strong", modelInfo: { name: "NatiTs/Disease-Prediction-Model", revision: "c87dc2f" },
  predictions: [{ label: "Migraine", displayName: "Migraine", score: 0.91, specialty: "Neurology" }, { label: "Allergy", displayName: "Allergy", score: 0.05, specialty: "X" }],
  recommendedSpecialist: "Neurology", specialtySource: "model", scoreNote: "Scores are raw model outputs, not calibrated probabilities.",
  specialization: { id: "s1", name: "Neurology" }, disclaimer: "Experimental symptom-pattern tool. It is not a diagnosis.", safety: { urgent: false, reasons: [], guidance: "g" } };
const setup = () => render(<MemoryRouter><SymptomAssessment /></MemoryRouter>);
const user = userEvent.setup();

beforeEach(() => { apiFetch.mockReset(); });

describe("SymptomAssessment", () => {
  it("always shows static emergency + experimental notices (no model needed)", async () => {
    apiFetch.mockImplementation(() => Promise.reject(new Error("down")));
    setup();
    expect(screen.getByText(/In an emergency, don't use this tool/)).toBeInTheDocument();
    expect(screen.getByText(/not been\s+clinically validated/)).toBeInTheDocument();
    await screen.findByText(/not available right now/);   // honest outage state, no mock fallback
    expect(screen.queryByText("Headache")).not.toBeInTheDocument();
  });

  it("loads the real catalogue, enforces the minimum, and sends exact keys", async () => {
    apiFetch.mockImplementation(async (path) => (path === "/api/ai/symptoms" ? CATALOGUE : OK));
    setup();
    const btn = await screen.findByRole("button", { name: "Check symptoms" });
    expect(btn).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Headache" }));
    await user.click(screen.getByRole("button", { name: "Nausea" }));
    expect(btn).toBeDisabled();                         // 2 < 3
    await user.click(screen.getByRole("button", { name: "Toxic look (typhos)" }));
    expect(btn).toBeEnabled();
    await user.click(btn);
    const call = apiFetch.mock.calls.find((c) => c[0] === "/api/ai/predict");
    expect(call[1]).toEqual({ method: "POST", body: { symptoms: ["headache", "nausea", "toxic_look_(typhos)"] } });
    expect(call[2]).toBe("tok");                        // explicit access token passed
  });

  it("enforces the maximum", async () => {
    apiFetch.mockResolvedValue(CATALOGUE);
    setup();
    for (const n of ["Headache", "Nausea", "Dizziness", "Chest pain"]) await user.click(await screen.findByRole("button", { name: n }));
    expect(screen.getByRole("button", { name: "Toxic look (typhos)" })).toBeDisabled();
  });

  it("shows experimental result with honest wording: raw 'model score', no percent/confidence, specialty source", async () => {
    apiFetch.mockImplementation(async (path) => (path === "/api/ai/symptoms" ? CATALOGUE : OK));
    setup();
    for (const n of ["Headache", "Nausea", "Dizziness"]) await user.click(await screen.findByRole("button", { name: n }));
    await user.click(screen.getByRole("button", { name: "Check symptoms" }));
    await screen.findByText("Migraine");
    expect(screen.getByText(/model score 0.91/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/91\s?%|confidence/i);
    expect(screen.getByText(/not a diagnosis · not clinically validated/)).toBeInTheDocument();
    expect(screen.getByText(/from the model's closest pattern/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find a Neurology doctor" })).toBeInTheDocument();
    expect(screen.queryByText(/medication|diet|workout/i)).not.toBeInTheDocument();
  });

  it("inconclusive result gives no condition and labels the specialty as a default, not model output", async () => {
    const weak = { ...OK, status: "inconclusive", matchStrength: "weak", recommendedSpecialist: "General Medicine", specialtySource: "default", specialization: { id: "g", name: "General Medicine" } };
    apiFetch.mockImplementation(async (path) => (path === "/api/ai/symptoms" ? CATALOGUE : weak));
    setup();
    for (const n of ["Headache", "Nausea", "Dizziness"]) await user.click(await screen.findByRole("button", { name: n }));
    await user.click(screen.getByRole("button", { name: "Check symptoms" }));
    await screen.findByText(/did not match any pattern strongly enough/);
    expect(screen.queryByText("Migraine")).not.toBeInTheDocument();
    expect(screen.getByText(/general starting point, not from the model/)).toBeInTheDocument();
  });

  it("URGENT warning is shown even when the AI service is down (error carries backend safety)", async () => {
    const err = Object.assign(new Error("The symptom assessment service is not available right now."), {
      status: 503, body: { safety: { urgent: true, reasons: ["chest pain"], guidance: "Seek emergency medical care now: call 999." } } });
    apiFetch.mockImplementation((path) => (path === "/api/ai/symptoms" ? Promise.resolve(CATALOGUE) : Promise.reject(err)));
    setup();
    for (const n of ["Headache", "Chest pain", "Dizziness"]) await user.click(await screen.findByRole("button", { name: n }));
    await user.click(screen.getByRole("button", { name: "Check symptoms" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Seek urgent medical care/);
    expect(alert).toHaveTextContent(/chest pain/);
    expect(screen.getByText(/No assessment was made/)).toBeInTheDocument();
  });

  it("specialty missing from the system: says so instead of linking to an empty filter", async () => {
    apiFetch.mockImplementation(async (path) => (path === "/api/ai/symptoms" ? CATALOGUE : { ...OK, specialization: null }));
    setup();
    for (const n of ["Headache", "Nausea", "Dizziness"]) await user.click(await screen.findByRole("button", { name: n }));
    await user.click(screen.getByRole("button", { name: "Check symptoms" }));
    await screen.findByText(/No doctors are listed under this specialty yet/);
    expect(screen.queryByRole("button", { name: /Find a/ })).not.toBeInTheDocument();
  });
});
