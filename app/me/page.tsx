import { Me } from "@/components/Me";
import { WaterScene } from "@/components/Water";
import { stories } from "@/lib/feed";

export default function MePage() {
  return (
    <>
      <WaterScene photo={null} />
      <Me stories={stories()} />
    </>
  );
}
