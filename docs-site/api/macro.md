<ApiPageHeader ctx="ctx.macro" kind="controle do macro" icon="play" />

# macro

<p class="api-lead">Controles do próprio macro. O efeito só vale <strong>depois</strong> que o script termina de rodar, não na hora da chamada.</p>

<script setup>
import { data } from '../.vitepress/data/script-ctx.data.ts';
const ctx = data.interfaces.find((i) => i.name === 'ScriptCtx');
const member = ctx.members.find((m) => m.name === 'macro');
const statusReturns = [
  { value: `'running'`, desc: 'Atacando.' },
  { value: `'paused'`, desc: 'Pausado por script.' },
  { value: `'disabled'`, desc: 'Ataque desligado na aba Ataque da config.' },
];
</script>

<ApiSection :member="member">
  <template #after>
    <ApiEnum label="Retornos de attack.status()" :items="statusReturns" />
  </template>
</ApiSection>
