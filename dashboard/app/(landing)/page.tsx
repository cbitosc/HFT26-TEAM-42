import { Story } from "@/components/Story";
import { storyFacts } from "@/lib/storyFacts";

export default function Landing() {
  return (
    <main>
      <Story facts={storyFacts()} />
    </main>
  );
}
