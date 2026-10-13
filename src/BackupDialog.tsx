import { useState } from "react";
import { api, download } from "./api";
import { encryptBackup, decryptBackup } from "../shared/backupCrypto";
import { Modal, Message } from "./components";
export default function BackupDialog({ onClose }: { onClose: () => void }) {
  const [staff, setStaff] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="下载加密完整备份" onClose={onClose} closeDisabled={busy}>
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError("");
          if (password !== repeat) {
            setError("两次备份密码不一致。");
            return;
          }
          if (password === staff) {
            setError("备份密码请与工作人员口令分开设置。");
            return;
          }
          setBusy(true);
          try {
            const value = await api("/admin/backup", { password: staff });
            const encrypted = await encryptBackup(value, password);
            const verified = await decryptBackup(encrypted, password);
            if (JSON.stringify(verified) !== JSON.stringify(value))
              throw Error("备份校验失败，请重新尝试。");
            download(
              "生活导师加密备份-" +
                new Date().toISOString().replaceAll(":", "-") +
                ".mentor-backup",
              JSON.stringify(encrypted),
              "application/json",
            );
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          文件包含名单和修改记录。只有备份密码才能解开；请将密码存入密码管理器，与文件分开保管。忘记密码无法恢复。
        </p>
        <label>
          工作人员口令（再次核对身份）
          <input
            type="password"
            autoComplete="current-password"
            required
            maxLength={300}
            disabled={busy}
            value={staff}
            onChange={(e) => setStaff(e.target.value)}
          />
        </label>
        <label>
          备份密码（至少16个字符）
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={16}
            maxLength={300}
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          再次填写备份密码
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={16}
            maxLength={300}
            disabled={busy}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        {error && <Message>{error}</Message>}
        <button className="button primary" disabled={busy}>
          {busy ? "正在加密并校验…" : "加密并下载"}
        </button>
        <p className="muted">
          普通Excel名单仍用于工作流转。此备份可在其他电脑解密；完整系统恢复还需要维护人员保管的系统密钥。
        </p>
      </form>
    </Modal>
  );
}
