<script setup lang="ts">
// Page-top metadata: `ctx.X` chip + kind chip with an icon (e.g. "entidade ·
// estado do jogo", "função · ação"). Icon names map to Heroicons 20/solid,
// except `skull` (game-icons, same family the app uses for monsters).
import {
  BellIcon,
  CircleStackIcon,
  CommandLineIcon,
  CubeIcon,
  PlayIcon,
  TagIcon,
  UserIcon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/vue/20/solid';
import { Icon, addCollection } from '@iconify/vue/offline';
import gameIcons from '@iconify-json/game-icons/icons.json';
import type { FunctionalComponent } from 'vue';
import { computed } from 'vue';

// Entrada OFFLINE do @iconify/vue v5: renderiza do storage local, sem fetch à
// API em runtime (o docs roda offline dentro do Electron) — a entrada default
// ignora o storage e renderiza um placeholder vazio.
addCollection(gameIcons);

const props = defineProps<{ ctx: string; kind: string; icon: string }>();

const HEROICONS: Record<string, FunctionalComponent> = {
  bell: BellIcon,
  cmd: CommandLineIcon,
  cube: CubeIcon,
  play: PlayIcon,
  stack: CircleStackIcon,
  tag: TagIcon,
  user: UserIcon,
  ugroup: UserGroupIcon,
  users: UsersIcon,
};

const heroicon = computed(() => HEROICONS[props.icon] ?? null);
</script>

<template>
  <div class="api-head-meta">
    <span class="api-ctx-chip">{{ ctx }}</span>
    <span class="api-kind-chip">
      <Icon v-if="icon === 'skull'" icon="game-icons:tentacles-skull" aria-hidden="true" />
      <component :is="heroicon" v-else-if="heroicon" aria-hidden="true" />
      {{ kind }}
    </span>
  </div>
</template>
