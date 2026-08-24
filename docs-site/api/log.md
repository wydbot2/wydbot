<ApiPageHeader ctx="ctx.log" kind="função · ação" icon="cmd" />

# log

<p class="api-lead">Escreve uma linha no painel de logs do macro, com o prefixo <code>[script]</code>.</p>

<script setup>
import { data } from '../.vitepress/data/script-ctx.data.ts';
const ctx = data.interfaces.find((i) => i.name === 'ScriptCtx');
const member = ctx.members.find((m) => m.name === 'log');
</script>

<ApiSection :member="member" />
