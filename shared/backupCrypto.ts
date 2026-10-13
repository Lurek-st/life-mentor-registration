const FORMAT = "mentor-encrypted-backup-v1";
const ITERATIONS = 600000;
const enc = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function bytes(value: unknown, length?: number) {
  if (
    typeof value !== "string" ||
    !/^(?:[0-9a-f]{2})+$/.test(value) ||
    (length && value.length !== length * 2)
  )
    throw Error("备份格式不正确。");
  return Uint8Array.from(value.match(/../g)!, (s) => parseInt(s, 16));
}
async function key(password: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptBackup(value: unknown, password: string) {
  if (password.length < 16 || password.length > 300)
    throw Error("备份密码请使用16至300个字符。");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(FORMAT) },
    await key(password, salt),
    enc.encode(JSON.stringify(value)),
  );
  return {
    format: FORMAT,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: hex(salt),
    iv: hex(iv),
    ciphertext: hex(new Uint8Array(cipher)),
  };
}
export async function decryptBackup(value: any, password: string) {
  if (
    !value ||
    value.format !== FORMAT ||
    value.algorithm !== "AES-256-GCM" ||
    value.kdf !== "PBKDF2-SHA256" ||
    value.iterations !== ITERATIONS ||
    typeof value.ciphertext !== "string" ||
    value.ciphertext.length > 100_000_000
  )
    throw Error("备份格式或版本不支持。");
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes(value.iv, 12),
        additionalData: enc.encode(FORMAT),
      },
      await key(password, bytes(value.salt, 16)),
      bytes(value.ciphertext),
    );
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } catch {
    throw Error("备份密码不正确，或文件已损坏。");
  }
}
