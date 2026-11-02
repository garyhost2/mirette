import Link from "next/link";
import { WaterScene } from "@/components/Water";

export default function NotFound() {
  return (
    <div className="me-page">
      <WaterScene photo={null} />
      <h1>Nothing here</h1>
      <p>This page has drifted away.</p>
      <div className="actions">
        <Link href="/" className="btn">
          Back to Discover
        </Link>
      </div>
    </div>
  );
}
