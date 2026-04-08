// Returns a CSS filter string that subtly warms the palette in early
// morning and returns to neutral by midday. Pure function, not stateful.
export function useColorTemp() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9)  return "sepia(0.08) saturate(1.05)";
  if (hour >= 9 && hour < 12) return "sepia(0.03) saturate(1.02)";
  return "none";
}
