import { SmoothScroll } from "@/components/SmoothScroll";
import "@/app/styles/story.css";

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SmoothScroll />
      {children}
    </>
  );
}
