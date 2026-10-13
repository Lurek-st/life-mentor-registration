import { Component, type ReactNode } from "react";

/** Keep a failed dynamic module or render from taking down the entire page. */
export default class LoadBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const en = document.documentElement.lang === "en";
    return (
      <section className="load-recovery" role="alert">
        <h2>
          {en ? "This page could not finish loading" : "页面暂时未能完整打开"}
        </h2>
        <p>
          {en
            ? "A connection interruption or a site update may have interrupted loading. Reload to try again."
            : "连接中断或网站更新可能影响了加载，请重新打开后再试。"}
        </p>
        <p>
          {en
            ? "Reloading will not submit anything. Unsaved edits may be lost; if you already submitted, check the result before trying again."
            : "重新打开不会提交任何操作。尚未保存的填写可能丢失；如果刚提交过，请先核对结果。"}
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          {en ? "Reload this page" : "重新打开当前页面"}
        </button>
      </section>
    );
  }
}
