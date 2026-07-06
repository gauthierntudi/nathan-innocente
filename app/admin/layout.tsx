import "./admin.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-theme">{children}</div>;
}
