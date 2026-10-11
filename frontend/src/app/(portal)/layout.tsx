import PortalShell from "@/components/portal-shell";

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PortalShell>{children}</PortalShell>;
}
