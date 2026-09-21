import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { RefreshCw, ArrowUpRight, CalendarDays } from "lucide-react";
import { api } from "./api";
import { overview, overviewEn } from "../shared/programme";
import { type Snapshot, type Session, monthKey } from "../shared/model";
import { Notice, Message, SessionRow, Footnote, Modal } from "./components";
import SessionDrawer from "./SessionDrawer";
import MyRegistrations from "./MyRegistrations";
const Admin = lazy(() => import("./Admin"));
const currentPage = () =>
  location.hash === "#staff"
    ? "staff"
    : location.hash === "#mine"
      ? "mine"
      : "sessions";
export default function App() {
  const [page, setPage] = useState(currentPage),
    [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [month, setMonth] = useState("all"),
    [selected, setSelected] = useState<Session | null>(null),
    [info, setInfo] = useState(""),
    [refreshed, setRefreshed] = useState("");
  const refresh = useCallback(async () => {
    try {
      const next = await api<Snapshot>("/sessions");
      setData(next);
      setSelected((prev) =>
        prev
          ? next.sessions.find((s) => s.id === prev.id) || {
              ...prev,
              status: "archived",
              state: "archived",
            }
          : null,
      );
      setError("");
      setRefreshed(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    const visible = () => {
        if (document.visibilityState === "visible") void refresh();
      },
      hash = () => setPage(currentPage());
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("hashchange", hash);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("hashchange", hash);
    };
  }, [refresh]);
  function navigate(p: string) {
    location.hash = p;
    setPage(p);
  }
  const months = Array.from(
      new Set(data?.sessions.map((s) => monthKey(s.start_at)) || []),
    ).sort(),
    filtered =
      data?.sessions.filter(
        (s) => month === "all" || monthKey(s.start_at) === month,
      ) || [];
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href="#sessions"
            onClick={() => navigate("sessions")}
          >
            <strong>导师同行</strong>
            <span>培训活动报名</span>
          </a>
          <nav aria-label="主导航">
            <button
              className={page === "sessions" ? "active" : ""}
              onClick={() => navigate("sessions")}
            >
              培训场次
            </button>
            <button
              className={page === "mine" ? "active" : ""}
              onClick={() => navigate("mine")}
            >
              我的报名
            </button>
          </nav>
        </div>
      </header>
      <main className="main">
        {data?.mode === "preview" && <Notice />}
        {page === "staff" ? (
          <Suspense fallback={<p className="loading">正在打开管理入口…</p>}>
            <Admin onChanged={() => void refresh()} />
          </Suspense>
        ) : page === "mine" ? (
          data ? (
            <MyRegistrations
              space={data.dataSpace}
              contact={data.settings.contact}
              onChanged={() => void refresh()}
            />
          ) : (
            <Message>{error || "正在读取报名入口…"}</Message>
          )
        ) : (
          <>
            <section className="intro">
              <h1>选择适合你的培训场次</h1>
              <p className="lede">
                四场一轮 <span>·</span> 主题轮换 <span>·</span> 各场独立报名
              </p>
              <p className="subtitle-en">
                Life Mentor Registration · Training and Workshops
              </p>
              <p className="intro-copy">{overview}</p>
              <button
                className="text-button"
                onClick={() => setInfo("programme")}
              >
                培训介绍 / Programme overview <ArrowUpRight size={14} />
              </button>
            </section>
            {data?.settings.registration_open === "false" && (
              <Message>报名入口暂时关闭，可以继续查看场次和已有报名。</Message>
            )}
            <div className="list-toolbar">
              <div className="months" role="group" aria-label="按月份筛选">
                {["all", ...months].map((value) => (
                  <button
                    key={value}
                    className={month === value ? "active" : ""}
                    onClick={() => setMonth(value)}
                    aria-pressed={month === value}
                  >
                    {value === "all"
                      ? "全部轮次"
                      : months.every(
                            (m) => m.slice(0, 4) === months[0].slice(0, 4),
                          )
                        ? Number(value.slice(5)) + "月"
                        : value.replace("-", "年") + "月"}
                  </button>
                ))}
              </div>
              <button
                className="text-button refresh"
                onClick={() => void refresh()}
              >
                <RefreshCw size={15} />
                <span>{refreshed ? "更新于 " + refreshed : "刷新余量"}</span>
              </button>
            </div>
            {error && (
              <Message>
                {error}
                <button className="text-button" onClick={() => void refresh()}>
                  重新连接
                </button>
              </Message>
            )}
            {loading ? (
              <div className="loading">
                <CalendarDays size={24} />
                正在读取培训场次…
              </div>
            ) : (
              <>
                {data?.rounds.map((round) => {
                  const list = filtered.filter((s) => s.round_id === round.id);
                  return list.length ? (
                    <section className="round-section" key={round.id}>
                      <div className="round-heading">
                        <h2>{round.title}</h2>
                        <span>
                          {list.length} 场{month !== "all" ? " · 当前月份" : ""}
                        </span>
                      </div>
                      <div className="list-head">
                        <span>日期</span>
                        <span>主题与内容</span>
                        <span>名额</span>
                        <span>操作</span>
                      </div>
                      <div className="session-list">
                        {list.map((s) => (
                          <SessionRow
                            key={s.id}
                            session={s}
                            onOpen={setSelected}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null;
                })}
                {!filtered.length && (
                  <div className="empty">暂无对应的培训安排。</div>
                )}
                <Footnote />
                <p className="rule-note">
                  无需注册，填写姓名、所属部门和工号即可报名。
                  {data?.settings.max_sessions === "0"
                    ? "每人可报场数不限；"
                    : "每人最多可报 " + data?.settings.max_sessions + " 场；"}
                  {data?.settings.self_cancel === "true"
                    ? "截止前可在“我的报名”自行取消。"
                    : "取消需联系工作人员。"}
                  余量每分钟更新，提交时核实名额与截止时间。
                </p>
              </>
            )}
          </>
        )}
      </main>
      <footer className="footer">
        <div>
          <button onClick={() => setInfo("programme")}>培训介绍</button>
          <button onClick={() => setInfo("privacy")}>信息使用说明</button>
          <button onClick={() => navigate("staff")}>工作人员入口</button>
        </div>
        <span>导师同行 · 培训活动报名</span>
      </footer>
      {selected && data && (
        <SessionDrawer
          session={selected}
          data={data}
          onClose={() => setSelected(null)}
          onChanged={() => void refresh()}
          onPrivacy={() => setInfo("privacy")}
        />
      )}
      {info && (
        <Modal
          title={
            info === "programme"
              ? "培训介绍 / Programme overview"
              : "信息使用说明 / Information use"
          }
          onClose={() => setInfo("")}
        >
          <div className="prose">
            {info === "programme" ? (
              <>
                <h2>导师同行：培训活动报名</h2>
                <p>{overview}</p>
                <p>{overviewEn}</p>
                <h3>轮次与内容</h3>
                <p>
                  示例按四场一轮安排，主题依次轮换；每场包含活动导览、主题讨论、实践分享和自由交流。可以根据需要选择单场，不要求整轮报名。实际安排以各场详情为准。
                </p>
                <p>
                  请在每场详情中核对最新日期、时间、地点、内容和报名截止时间。
                </p>
                <h3>报名须知</h3>
                <p>
                  请确认能够按时参加，勿重复报名同一场次。改期等安排会在“我的报名”中提示，请留意工作人员发布的通知。
                </p>
              </>
            ) : (
              <>
                <p>
                  本报名页面由活动组织方用于培训报名。姓名、所属部门、工号及所选场次用于登记、名额统筹、去重、参训名单核对和相关事务管理。
                </p>
                <p>
                  Your name, department, employee number and selected sessions
                  are used to administer this training series, allocate places,
                  prevent duplicate registrations and verify participant lists.
                </p>
                <p>
                  报名资料由本页面的部署方保存和管理。公开页面只显示人数，不公开个人名单；名单仅供登录后的工作人员查看和导出。
                </p>
                <p>
                  本浏览器保存私密报名凭证，用于查看和取消自己的报名。换设备时可导入凭证；请勿转发给他人。在公用设备使用后，请清除本浏览器中保存的凭证。
                </p>
                <p>{data?.settings.retention}</p>
                <p>
                  更正、取消或资料使用事宜，请联系：
                  {data?.settings.contact || "本次活动组织方"}。
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
