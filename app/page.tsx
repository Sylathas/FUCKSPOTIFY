import Header from "@/components/Header";
import Stage1Login from "./stages/Stage1Login";
import Stage2Library from "./stages/Stage2Library.server";
import Stage3Platform from "./stages/Stage3Platform";
import Stage4Transfer from "./stages/Stage4Transfer";

export default function Home() {
  return (
    <>
      <Header />

      {/* Fake‑Winamp strip --------------------------------------------------- */}
      <section
        className="
          flex overflow-x-auto snap-x snap-mandatory
          bg-red-600 pb-4
        "
      >
        {/* Each stage takes full viewport width so you get a carousel feel */}
        <div className="snap-start shrink-0 w-screen px-4">
          <Stage1Login />
        </div>
        <div className="snap-start shrink-0 w-screen px-4">
          <Stage2Library />
        </div>
        <div className="snap-start shrink-0 w-screen px-4">
          <Stage3Platform />
        </div>
        <div className="snap-start shrink-0 w-screen px-4">
          <Stage4Transfer />
        </div>
      </section>
    </>
  );
}