// Per-teacher accent tokens applied via inline CSS variables on a
// data-teacher="<id>" element so the rest of the styling stays in Tailwind.

export function teacherStyle(teacher) {
  if (!teacher) return undefined;
  return {
    "--teacher-color": teacher.color,
    "--teacher-bg": teacher.bg,
    "--teacher-border": teacher.border,
  };
}
