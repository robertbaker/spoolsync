import Callout from "./Callout.astro";
import CardGrid from "./CardGrid.astro";
import InfoCard from "./InfoCard.astro";
import ProsCons from "./ProsCons.astro";

/** Components available in every post without an import. Passed to `<Content components={...}>`. */
export const mdxComponents = { Callout, CardGrid, InfoCard, ProsCons };
