import ElegantLoader from "@/components/player/ElegantLoader";

export default function RouteProgress() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "#131519" }}
    >
      <ElegantLoader size={56} />
    </div>
  );
}
