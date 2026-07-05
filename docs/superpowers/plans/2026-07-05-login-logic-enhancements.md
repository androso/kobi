# Login Logic Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement password confirmation on signup and "Remember Me" email persistence logic, and update integration tests.

**Architecture:** 
- Add `confirmPassword` and `rememberMe` state in `LoginPage.tsx`.
- Load saved email on mount.
- Conditionally render the confirmation field on signup.
- Update `App.test.tsx` signup tests to fill the confirmation field.

**Tech Stack:** React, LocalStorage, Vitest

---

### Task 1: Update LoginPage.tsx State & Validation
**Files:**
- Modify: `apps/web/src/features/auth/LoginPage.tsx`

- [ ] **Step 1: Add new state variables**
  Add `confirmPassword` and `rememberMe` state:
  ```typescript
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  ```

- [ ] **Step 2: Read saved email on mount**
  Add a `useEffect` hook to load the email from `localStorage`:
  ```typescript
  useEffect(() => {
    const savedEmail = localStorage.getItem("kobi_remembered_email");
    if (savedEmail) {
      setTeacherEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);
  ```

- [ ] **Step 3: Update handleTeacherSubmit validation and persistence**
  Update `handleTeacherSubmit` to check confirmation match, and persist/clear the remembered email:
  ```typescript
  // Validation:
  if (teacherAuthMode === "signup") {
    if (!confirmPassword.trim()) {
      nextFieldErrors.confirmPassword = "Confirma tu contraseña.";
    } else if (confirmPassword !== teacherPassword) {
      nextFieldErrors.confirmPassword = "Las contraseñas no coinciden.";
    }
  }
  // Persistence on successful logic:
  if (rememberMe) {
    localStorage.setItem("kobi_remembered_email", normalizedEmail);
  } else {
    localStorage.removeItem("kobi_remembered_email");
  }
  ```
  Ensure `fieldErrors` type includes `confirmPassword?: string`.

- [ ] **Step 4: Render the Confirmar contraseña field and bind rememberMe checkbox**
  Render the password confirmation field only during signup mode:
  ```tsx
  {teacherAuthMode === "signup" ? (
    <label className="group block">
      <span className="sr-only">Confirmar contraseña</span>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
        <Lock className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
        <input
          className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirmar contraseña"
          type={showConfirmPassword ? "text" : "password"}
          value={confirmPassword}
        />
        <button
          aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="shrink-0 text-slate-300 transition hover:text-sky-400 focus-visible:text-[#1077e5] focus-visible:outline-none"
          onClick={() => setShowConfirmPassword((current) => !current)}
          type="button"
        >
          {showConfirmPassword ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
        </button>
      </div>
      {fieldErrors.confirmPassword ? <p className="mt-2 text-xs text-[#1077e5]">{fieldErrors.confirmPassword}</p> : null}
    </label>
  ) : null}
  ```
  Also bind the checkbox:
  ```tsx
  <input
    className="h-4 w-4 accent-[#1077e5]"
    type="checkbox"
    checked={rememberMe}
    onChange={(event) => setRememberMe(event.target.checked)}
  />
  ```

---

### Task 2: Align Signup Tests in App.test.tsx
**Files:**
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Fill password confirmation in signup tests**
  In the two teacher signup tests, locate where we enter the password, and also enter the confirmation password:
  ```typescript
  await user.type(screen.getByPlaceholderText(/confirmar contrase[nñ]a/i), "securepass");
  ```

- [ ] **Step 2: Run all web tests**
  Run: `pnpm --filter @kobi/web test`
  Expected: All 15 tests pass.
