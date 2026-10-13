import { useCallback, useEffect, useState } from "react";
import { stamp } from "../shared/programme";
import { api } from "./api";
import { Message, Modal } from "./components";
type Notice = {
  session: { title: string };
  total: number;
  addresses: string[];
  missingEmail: number;
  duplicateEmails: number;
  generatedAt: number;
  subject: string;
  message: string;
};
export default function EmailNotice({
  sid,
  query,
  onClose,
}: {
  sid: string;
  query: string;
  onClose: () => void;
}) {
  const [notice, setNotice] = useState<Notice | null>(null),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false),
    [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    setFeedback("");
    setNotice(null);
    api<Notice>(
      "/admin/recipients?" + new URLSearchParams({ session: sid, q: query }),
    )
      .then((r) => {
        if (live) setNotice(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [sid, query, nonce]);
  const copy = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(label + "已复制。");
    } catch {
      setFeedback(
        "浏览器未允许自动复制，请选中对应文本框中的全部文字手动复制。",
      );
    }
  }, []);
  return (
    <Modal title="准备邮件提醒" onClose={onClose}>
      <div className="editor-form">
        <p>
          在 Outlook 新建邮件，将收件邮箱粘贴到<strong>“密送 / Bcc”</strong>
          ，核对主题和正文后由工作人员发送。此处不会自动发送邮件。
        </p>
        <p className="muted">
          范围：所选场次中未自行取消的全部报名，覆盖所有页
          {query ? `；沿用搜索“${query}”` : ""}
          。不受名单的个人报名状态筛选影响。
        </p>
        {busy && <p role="status">正在整理邮箱…</p>}
        {error && <Message>{error}</Message>}
        {notice && (
          <>
            <h3>{notice.session.title}</h3>
            <p>
              共 {notice.total} 条报名 · 可用收件邮箱 {notice.addresses.length}{" "}
              个 · 缺少有效邮箱 {notice.missingEmail} 条 · 重复邮箱合并{" "}
              {notice.duplicateEmails} 条
            </p>
            {notice.missingEmail > 0 && (
              <Message>
                有 {notice.missingEmail}{" "}
                条报名没有有效邮箱，未列入收件人。请在名单中补填，或另行联系这些老师。
              </Message>
            )}
            <label>
              密送收件邮箱（以分号分隔）
              <textarea
                readOnly
                rows={4}
                value={notice.addresses.join("; ")}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <button
              className="button secondary"
              disabled={!notice.addresses.length}
              onClick={() =>
                void copy(notice.addresses.join("; "), "密送收件邮箱")
              }
            >
              复制密送邮箱
            </button>
            <label>
              邮件主题
              <input
                value={notice.subject}
                maxLength={500}
                onChange={(e) =>
                  setNotice({ ...notice, subject: e.target.value })
                }
              />
            </label>
            <button
              className="button secondary"
              onClick={() => void copy(notice.subject, "主题")}
            >
              复制主题
            </button>
            <label>
              邮件正文
              <textarea
                rows={10}
                value={notice.message}
                maxLength={20000}
                onChange={(e) =>
                  setNotice({ ...notice, message: e.target.value })
                }
              />
            </label>
            <button
              className="button secondary"
              onClick={() => void copy(notice.message, "正文")}
            >
              复制正文
            </button>
            <p className="muted">
              整理于 {stamp(notice.generatedAt)}
              。报名或安排发生变化后请重新整理。刷新会重新生成主题和正文，请先保存已编辑内容。
            </p>
          </>
        )}
        {feedback && <p role="status">{feedback}</p>}
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => setNonce((n) => n + 1)}
        >
          重新整理最新名单
        </button>
      </div>
    </Modal>
  );
}
