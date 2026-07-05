# Design Spec: Kobi Login / Signup Flow Cleanup

This design spec outlines the improvements to the Kobi Login and Signup view to simplify the interface and remove redundant controls.

---

## 1. Objectives

- **Simplified Controls**: Remove the segmented `Iniciar sesión` / `Crear cuenta` toggle under the teacher form.
- **Dynamic Headers**: Update the main heading to change dynamically based on the role and mode:
  - Estudiante: "Entrar a la clase"
  - Profesor (Login): "Iniciar sesión"
  - Profesor (Registro): "Crear cuenta"
- **Contextual Navigation**: Add toggle links at the bottom of the forms to switch between login and signup.

---

## 2. Proposed Changes

- Remove the sub-mode toggle in `LoginPage.tsx`.
- Adjust `h2` title and bottom link toggle action.
- Update `App.test.tsx` selectors to match the dynamic headings.
