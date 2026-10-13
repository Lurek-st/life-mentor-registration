// A single, ordinary ASCII mailbox; display names and address lists are not accepted.
export function normaliseEmail(value: string): string {
  const text = value.trim();
  const at = text.lastIndexOf("@");
  return at < 0
    ? text
    : text.slice(0, at) + "@" + text.slice(at + 1).toLowerCase();
}
export function validEmail(value: string): boolean {
  if (value.length > 254 || /[\r\n\u0000-\u001f\u007f]/.test(value))
    return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return (
    local.length > 0 &&
    local.length <= 64 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !local.includes("..") &&
    domain.includes(".") &&
    domain
      .split(".")
      .every((label) =>
        /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label),
      )
  );
}
