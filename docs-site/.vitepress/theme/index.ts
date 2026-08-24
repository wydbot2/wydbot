import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import ApiSection from './components/ApiSection.vue';
import ApiTypePage from './components/ApiTypePage.vue';
import ApiPageHeader from './components/ApiPageHeader.vue';
import ApiEnum from './components/ApiEnum.vue';
import HomeFeatures from './components/HomeFeatures.vue';
import './style.css';

// Only components used directly in .md pages need global registration; the
// rest (ApiCard, ApiFieldList, ApiMethod, ApiNote, ApiTypeBadge, ApiExample)
// are internal building blocks imported by the ones below.
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ApiSection', ApiSection);
    app.component('ApiTypePage', ApiTypePage);
    app.component('ApiPageHeader', ApiPageHeader);
    app.component('ApiEnum', ApiEnum);
    app.component('HomeFeatures', HomeFeatures);
  },
} satisfies Theme;
