// 设置页的分组标题。分组和底部导航一一对应（吃饭 / 记账 / 卡包），
// 这样「某个功能的设置在哪」不用猜。
export default function SettingsSection({ icon: Icon, title, children }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-ink/45 uppercase tracking-wide px-0.5">
        <Icon size={13} /> {title}
      </h3>
      {children}
    </section>
  );
}
