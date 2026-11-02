import Link from "next/link";
import { Feed } from "@/components/Feed";
import { lookItems } from "@/lib/feed";

export default function CreatorsPage() {
  return (
    <Feed
      items={lookItems()}
      introPhoto="/faces/lucie.jpg"
      intro={
        <>
          <h1>Your creators</h1>
          <p>Scan your face to see your three closest matches.</p>
          <div className="actions">
            <Link href="/try-on" className="btn">
              Scan my face
            </Link>
          </div>
        </>
      }
    />
  );
}
