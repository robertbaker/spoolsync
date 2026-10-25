import { TourController } from "./tour/controller";
import { steps } from "./tour/steps";
import { createTourView } from "./tour/view";

const controller = new TourController(
  steps,
  {
    href: () => window.location.href,
    pathname: () => window.location.pathname,
    assign: (url) => window.location.assign(url),
    replace: (url) => window.location.replace(url),
    update: (url) => window.history.replaceState(null, "", url),
  },
  {
    render: (index) => view.render(index),
    clear: () => view.clear(),
    focusLauncher: () => view.focusLauncher(),
  },
);
const view = createTourView(steps, {
  clear: () => controller.clear(),
  launch: () => controller.launch(),
  goTo: (index) => controller.goTo(index),
});
controller.start();
