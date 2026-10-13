import { topics, overviewEn } from "../shared/programme";

export const programmeTitleEn =
  "Mentors Together: Training Registration and Attendance";
export const backgroundEn = [overviewEn];
// Translate only known example content. Custom staff-entered content is never guessed.
export const programmeEnglish: Record<string, string> = {
  ...Object.fromEntries(
    Object.values(topics).flatMap((t) => [
      [t.title, t.en],
      ...t.subjects.map((s, i) => [s, t.subjectsEn[i]]),
    ]),
  ),
  欢迎与活动导览: "Welcome and session introduction",
  "介绍本场目标、讨论安排和参与方式。":
    "Session goals, discussion format and how to participate.",
  实践经验分享: "Experience sharing",
  参与者交流实践经验: "Participants share practical experience",
  自由交流与答疑: "Open discussion and questions",
  "合影、离场": "Group photo and departure",
  交流相关经验: "Share relevant experience",
  讨论示例情境: "Discuss example scenarios",
  分享实践方法: "Share practical approaches",
  制定后续行动: "Plan next steps",
  示例活动室: "Example meeting room",
  第一轮: "Round 1",
  第二轮: "Round 2",
  第三轮: "Round 3",
  活动组织方工作人员: "the organizing staff",
  本人取消: "Cancelled by participant",
};

export const interfaceEnglish: Record<string, string> = {
  "正在核对…": "Checking…",
  "正在取消…": "Cancelling…",
  "本场报名已取消。": "Your registration for this session has been cancelled.",
  "已保存对最新安排的确认。":
    "Your confirmation of the updated arrangements has been saved.",
  "本场联系邮箱已更新。":
    "Your contact email for this session has been updated.",
  "仅清除此浏览器保存的凭证与待确认提交，不会取消服务器上的报名。请先保存凭证；尚未确认的提交清除后需联系工作人员核对。是否继续？":
    "Clear receipts and pending submissions saved in this browser? Server registrations will remain. Save your receipts first; contact staff to check any unconfirmed submission after clearing it.",
  "浏览器未允许清除，请在浏览器设置中清除本站数据。":
    "The browser could not clear the saved data. Clear this site's data in browser settings.",
  "工号（8位数字）": "Employee number (8 digits)",
  请填写完整的8位工号: "Enter your full 8-digit employee number",
  "工号须为8位数字，请核对后再提交。":
    "Your employee number must contain exactly 8 digits. Please check it before submitting.",
  "联系邮箱（可稍后补充）": "Contact email (can be added later)",
  "填写 @ 前的部分，后缀已自动补全。":
    "Enter the part before @. The domain is already filled in.",
  "请填写测试邮箱。": "Enter a test email address.",
  导师同行: "Mentors Together",
  培训报名与参会管理: "Training Registration and Attendance",
  "导师同行：培训报名与参会管理": programmeTitleEn,
  "导师同行 · 培训报名与参会管理": programmeTitleEn,
  主导航: "Main navigation",
  培训场次: "Sessions",
  我的报名: "My registrations",
  "正在打开管理入口…": "Opening staff tools…",
  "正在读取报名入口…": "Loading registration information…",
  选择适合你的培训场次: "Choose your training sessions",
  四场一轮: "Four sessions per round",
  主题轮换: "Rotating themes",
  各场独立报名: "Register for individual sessions",
  "培训介绍 / Programme overview": "Programme overview",
  "报名入口暂时关闭，可以继续查看场次和已有报名。":
    "Registration is temporarily closed. You can still view sessions and existing registrations.",
  按月份筛选: "Filter by month",
  全部轮次: "All rounds",
  更新于: "Updated at ",
  刷新余量: "Refresh availability",
  重新连接: "Reconnect",
  "正在读取培训场次…": "Loading sessions…",
  场: " sessions",
  "· 当前月份": " · selected month",
  日期: "Date",
  主题与内容: "Theme and content",
  名额: "Availability",
  操作: "Action",
  "暂无对应的培训安排。": "No sessions match this selection.",
  "无需注册，填写姓名、所属部门、工号和联系邮箱即可报名。":
    "No account is needed. Enter your name, department, employee number and contact email. ",
  "每人可报场数不限；": "There is no limit on sessions per person. ",
  每人最多可报: "You may register for up to ",
  "场；": " sessions. ",
  "截止前可在“我的报名”自行取消。":
    "You may cancel through “My registrations” before the deadline. ",
  "取消需联系工作人员。": "Please contact staff to cancel. ",
  "余量每分钟更新，提交时核实名额与截止时间。":
    "Availability refreshes every minute. Places and deadlines are checked when you submit.",
  培训介绍: "Programme overview",
  信息使用说明: "Information use",
  工作人员入口: "Staff area (Chinese)",
  "信息使用说明 / Information use": "Information use",
  培训目标: "Training objectives",
  "了解活动目标、参与方式和可用资源。":
    "Explore session goals, participation and available resources.",
  "分享实践经验，讨论常见问题。":
    "Share practical experience and discuss common questions.",
  "学习沟通方法，建立协作联系。":
    "Practise communication and build connections.",
  "交流行动计划，促进持续学习。": "Share action plans and continue learning.",
  "参与对象与活动形式以组织方通知为准，请按场次安排准时参加。":
    "Check the organizer’s notice for the audience and format. Please arrive on time.",
  轮次与内容: "Rounds and programme structure",
  "场次按轮次组织，包含主题分享与交流讨论。可以根据需要选择单场，不要求整轮报名。":
    "Sessions are grouped into rounds and include thematic sharing and discussion. You can select individual sessions without booking an entire round.",
  "请在每场详情中核对最新日期、时间、地点、内容和报名截止时间。":
    "Check each session’s details for the latest date, time, venue, content and registration deadline.",
  报名须知: "Registration notes",
  "请确认能够按时参加，勿重复报名同一场次。改期等安排会在“我的报名”中提示，请留意工作人员发布的通知。":
    "Please ensure you can attend on time and do not register twice for the same session. Schedule changes will be shown in “My registrations”. Please also check staff notices.",
  "本页面由活动组织方用于培训报名与参会管理。姓名、部门、工号、联系邮箱及报名与参会记录用于登记、名额统筹、去重、参会核对和培训通知。邮箱仅供工作人员联系，不向其他报名者公开。网站不会自动发送邮件。":
    "The organizer uses names, departments, employee numbers, contact emails, registrations and attendance records to manage places, prevent duplicates, review attendance and prepare notices. Emails are visible to staff only. This site does not send email automatically.",
  "资料由本网站组织方配置的数据库保存。公开页面只显示人数，不公开个人名单；名单仅供登录后的工作人员查看和导出。":
    "Information is stored in the database configured by the organizer. Public pages show counts only. Personal lists can only be viewed and exported by signed-in staff.",
  "本浏览器保存私密报名凭证，用于查看和取消自己的报名。换设备时可导入凭证；请勿转发给他人。在公用设备使用后，请清除本浏览器中保存的凭证。":
    "This browser stores private registration receipts so you can view and cancel your own registrations. You can import them on another device. Do not share them. Clear saved receipts after using a shared device.",
  "更正、取消或资料使用事宜，请联系：":
    "For corrections, cancellations or questions about information use, please contact ",
  "测试环境 · 请使用虚构信息，正式报名请使用正式链接":
    "Test environment — use fictional information. Use the official link for real registrations.",
  关闭详情: "Close details",
  余: "",
  席: " places left",
  人已报名: " registered",
  查看内容: "View programme",
  截止: "Closes ",
  查看并报名: "View & register",
  查看详情: "View details",
  "各场独立报名，具体内容、地点和截止时间以场次详情为准。全部时间为北京时间。":
    "Register for each session separately. Check session details for content, venue and deadline. All times are Beijing time (UTC+8).",
  "报名已成功，请保存下方私密凭证。":
    "Your registration succeeded. Please save the private receipt below.",
  "这次报名已取消，请关闭详情后重新报名。":
    "This registration was cancelled. Close the details and register again if needed.",
  "复制失败，请选择凭证文字复制，或保存凭证文件。":
    "Copy failed. Select and copy the receipt text, or save the receipt file.",
  报名已确认: "Registration confirmed",
  培训场次详情: "Session details",
  报名成功: "Registration successful",
  测试报名成功: "Test registration successful",
  "，已为你登记本场名额。": ", your place in this session is confirmed.",
  "可在本浏览器的“我的报名”查看和取消。":
    "View and manage it through “My registrations” in this browser.",
  "私密报名凭证 · 换设备时使用":
    "Private registration receipt · use on another device",
  已复制: "Copied",
  复制凭证: "Copy receipt",
  "我的报名凭证.txt": "my-registration-receipt.txt",
  保存凭证: "Save receipt",
  "本浏览器已保存凭证。请勿转发给他人；清理浏览器记录可能丢失凭证，可事先保存一份。":
    "Your receipt is saved in this browser. Do not share it. Clearing browser data may remove it, so save a copy first.",
  返回场次列表: "Back to sessions",
  本场内容: "Session programme",
  "安排说明：": "Programme update: ",
  "报名截止：": "Registration closes: ",
  全部时间为北京时间: "All times are Beijing time (UTC+8)",
  填写报名信息: "Registration details",
  填写测试信息: "Test registration details",
  "无需注册。请核对姓名、所属部门、工号和联系邮箱。":
    "No account needed. Check your name, department, employee number and contact email. ",
  "测试工号须以 TEST- 开头，请勿填写真实个人资料。":
    "Use a fictional employee number starting with TEST-. Do not enter real personal information.",
  "姓名 Name": "Name",
  "所属部门 Department / Unit": "Department / Unit",
  "工号 Employee number": "Employee number",
  "联系邮箱 Email": "Contact email",
  "邮箱供工作人员发送培训通知。网站不会自动发送确认邮件；报名结果以本页提示和“我的报名”为准。":
    "Staff use this email to send training notices. No automatic confirmation email is sent. Check this page and “My registrations” for your registration result.",
  "这场活动的安排有更新，请重新核对上方内容并确认。":
    "This session has changed. Review the updated details above and confirm again.",
  "我已核对信息与场次安排，确认可以参加，并知晓报名资料的使用说明。":
    "I have checked my details and the session arrangements, can attend, and have read the information use notice.",
  查看信息使用说明: "Read the information use notice",
  "正在确认名额…": "Confirming your place…",
  确认报名: "Confirm registration",
  确认测试报名: "Confirm test registration",
  "浏览不预留名额，以提交后的确认结果为准。连接中断后可在“我的报名”核对结果。":
    "Viewing a session does not reserve a place. Your place is confirmed only after successful submission. If the connection is interrupted, check “My registrations” before retrying.",
  "本场名额已满，请选择其他场次。":
    "This session is full. Please choose another session.",
  "本场已截止报名。": "Registration for this session has closed.",
  "本场活动已取消。": "This session has been cancelled.",
  "本场暂不接受报名。":
    "This session is not currently accepting registrations.",
  "请粘贴完整私密报名凭证。":
    "Please paste the complete private registration receipt.",
  "此凭证未找到报名，请核对是否为当前报名入口的凭证。":
    "No registration was found for this receipt. Check that it belongs to this registration site.",
  本浏览器已保存的报名与最新安排:
    "Registrations saved in this browser and the latest arrangements",
  刷新结果: "Refresh results",
  "正在核对报名记录…": "Checking your registrations…",
  "上次提交尚未确认结果。已核对服务器，暂未找到记录；可以使用同一次提交重试，不会重复占位。":
    "Your previous submission is unconfirmed. The server has been checked and no record was found. Retry the same submission below without reserving a duplicate place.",
  继续核对并重试: "Check and retry",
  本人报名已取消: "Your registration is cancelled",
  已报名: "Registered",
  "· 工号": " · Employee no. ",
  "本场活动已取消，请留意工作人员后续安排。原报名记录保留；已导入日历的老师请自行删除或调整原事项。":
    "This session has been cancelled. Please check staff notices. Your registration record is retained. If you imported a calendar event, remove or update it yourself.",
  "本场安排有更新，请重新核对。":
    "This session has changed. Please review the updated arrangements.",
  "原安排：": "Previously: ",
  "现安排：": "Now: ",
  查看最新培训内容: "View the updated programme",
  "已核对，我仍可参加": "Reviewed — I can still attend",
  "取消原因：": "Cancellation reason: ",
  修改联系邮箱: "Edit contact email",
  补填联系邮箱: "Add contact email",
  取消本场报名: "Cancel this registration",
  "报名凭证.txt": "registration-receipt.txt",
  凭证已复制: "Receipt copied",
  保存本场凭证: "Save this receipt",
  "联系邮箱：": "Contact email: ",
  "未填写，请补填以便工作人员联系":
    "Not provided. Please add an email so staff can contact you.",
  "当前浏览器没有已确认的报名。":
    "There are no confirmed registrations saved in this browser.",
  "在其他设备报过名，可以导入凭证；丢失凭证请联系工作人员核对。":
    "If you registered on another device, import your receipt. If you lost it, contact staff for help.",
  "在其他设备报过名？": "Registered on another device?",
  私密报名凭证: "Private registration receipt",
  导入并查看: "Import and view",
  "只凭姓名或工号不能查询、取消别人的报名。需要协助请联系：":
    "A name or employee number alone cannot be used to view or cancel someone else’s registration. For help, contact ",
  "我的全部报名凭证.txt": "all-registration-receipts.txt",
  保存全部凭证: "Save all receipts",
  "仅清除此浏览器保存的凭证，不会取消报名。请先保存凭证文件。是否继续？":
    "This only removes receipts saved in this browser; it does not cancel registrations. Save your receipts first. Continue?",
  清除本机凭证: "Clear receipts on this device",
  "确认取消“": "Cancel your registration for “",
  "”吗？名额会立即释放，再次报名需重新提交。":
    "”? Your place will be released immediately. You must submit again to re-register.",
  保留报名: "Keep registration",
  确认取消报名: "Confirm cancellation",
  更新本场联系邮箱: "Update contact email",
  "仅更新“": "This updates only your registration for “",
  "”这条报名。其他场次的邮箱请分别核对。":
    "”. Check the email for other registrations separately.",
  联系邮箱: "Contact email",
  "正在保存…": "Saving…",
  保存联系邮箱: "Save contact email",
  "培训日历.ics": "life-mentor-session.ics",
  "下载日历文件（Outlook 等）": "Download calendar file (Outlook, etc.)",
  "下载后打开文件，或在 Outlook 日历中选择“添加日历 → 从文件上传”。导入后，改期和取消不会自动同步，请自行调整原事项；提醒是否弹出取决于日历设置。微信内无法下载时，请用电脑或系统浏览器打开。":
    "Open the downloaded file, or choose “Add calendar → Upload from file” in Outlook Calendar. Changes and cancellations do not sync automatically; update the imported event yourself. Alerts depend on your calendar settings. If downloading does not work in WeChat, use a computer or your device’s browser.",
};

export const errorEnglish: Record<string, string> = {
  "这条报名或活动已不可确认，请刷新后核对。":
    "This registration or session can no longer be confirmed. Refresh to check its status.",
  "连接中断或等待超时，请重新连接后再试。":
    "The connection was interrupted or timed out. Reconnect and try again.",
  "连接中断或等待超时，操作结果尚未确认。请刷新核对后再操作。":
    "The connection was interrupted or timed out. The result is unconfirmed. Refresh and check before taking further action.",
  "浏览器提示网络可能已断开。已填写的信息仍留在当前页面，请恢复连接后继续。":
    "Your browser reports a possible lost connection. Your entries remain on this page. Reconnect to continue.",
  "当前显示的是上次成功读取的信息，余量和安排可能已变化。":
    "This is the last successfully loaded information. Availability and arrangements may have changed.",
  "正在重新连接…": "Reconnecting…",
  "正在刷新…": "Refreshing…",
  "仍然连接不上？": "Still unable to connect?",
  "可尝试切换 Wi-Fi／手机流量，或在系统浏览器中打开同一链接。若同一网络下多位老师都无法访问，请把网址、发生时间和浏览器报错交给工作人员核查。切换浏览器后，已有报名可使用私密凭证找回，请勿重复报名。":
    "Try switching between Wi-Fi and mobile data, or open the same link in your device’s browser. If several people on the same network cannot connect, share the URL, time and browser error with staff. On another browser, use your private receipt to recover an existing registration; do not register again.",
  "服务暂时不可用，请稍后重试。若刚提交过报名，请先查看“我的报名”。":
    "The service is temporarily unavailable. Please try again later. If you just submitted a registration, check “My registrations” first.",
  "找不到对应报名。": "No matching registration was found.",
  "找不到对应报名，请检查凭证。":
    "No matching registration was found. Please check your receipt.",
  "目前不能自行取消，请联系工作人员。":
    "You cannot cancel this registration yourself at present. Please contact staff.",
  "活动又有更新，请刷新后再确认。":
    "This session has changed again. Refresh before confirming.",
  "服务暂时繁忙，请稍后再试。":
    "The service is temporarily busy. Please try again later.",
  "连接中断或等待超时。请查看“我的报名”核对结果，再重试。":
    "The connection was interrupted or timed out. Check “My registrations” before retrying a submission.",
  "服务暂时没有返回可识别的结果，请稍后重试。":
    "The service returned an unreadable response. Please try again later.",
  "操作未完成。": "The operation could not be completed.",
  "本浏览器无法保存报名凭证。请使用允许保存网站数据的浏览器后重试。":
    "This browser cannot save your receipt. Use a browser that allows site storage, then try again.",
  "本浏览器无法保存报名凭证，请更换浏览器后报名。":
    "This browser cannot save your receipt. Please register using another browser.",
  "报名系统暂未完成配置。":
    "Registration is temporarily unavailable. Please contact staff.",
  "请从本站页面提交。": "Please submit from this website’s registration page.",
  "这场活动不存在或已撤下。":
    "This session does not exist or has been withdrawn.",
  "报名入口已暂停，请稍后再试。":
    "Registration has been paused. Please try again later.",
  "这场活动当前不能报名。":
    "This session is not currently accepting registrations.",
  "场次安排已更新，请核对最新日期、时间和内容后再提交。":
    "This session has changed. Check the latest date, time and content before submitting again.",
  "本场已报满，请选择其他场次。":
    "This session is full. Please choose another session.",
  "已达到每人可报场数上限。":
    "You have reached the maximum number of sessions per person.",
  "该工号已报名本场。请在“我的报名”查看，或联系工作人员协助核对。":
    "This employee number is already registered for this session. Check “My registrations” or contact staff for help.",
  "操作较频繁，请稍等一分钟后再试。":
    "Too many attempts. Please wait one minute and try again.",
  "请检查必填内容和文字长度。":
    "Please check required fields and text lengths.",
  "请检查数字范围。": "Please check the numeric values.",
  "请从报名页面提交。": "Please submit from the registration page.",
  "提交内容为空。": "The submission is empty.",
  "提交内容过长。": "The submission is too large.",
  "提交内容无法识别。": "The submission could not be read.",
  "此记录已被其他工作人员更新，请刷新后核对再保存。":
    "This record has changed. Refresh, review it and save again.",
  "工号请使用字母、数字、点、横线或下划线，保留开头的0。":
    "Use letters, numbers, dots, hyphens or underscores for your employee number. Keep any leading zeros.",
  "请填写一个有效的联系邮箱。": "Please enter a valid contact email.",
  "报名需要联系邮箱。请刷新页面，补充邮箱后重新提交。":
    "A contact email is required. Refresh the page, add your email and submit again.",
  "请填写一个有效的联系邮箱，不要填写多个地址。":
    "Please enter one valid contact email address.",
  "报名凭证格式不正确。": "The registration receipt format is invalid.",
  "报名凭证无效或记录不存在。":
    "The receipt is invalid or the registration was not found.",
  "测试环境请使用 TEST- 开头的虚构工号。":
    "In the test environment, use a fictional employee number starting with TEST-.",
  "请核对报名信息并勾选确认。":
    "Check your registration details and tick the confirmation box.",
  "这次提交内容已变更，请重新核对后提交。":
    "This submission has changed. Review it before submitting again.",
};
