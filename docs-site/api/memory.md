<ApiPageHeader ctx="ctx.memory" kind="memória entre scripts" icon="stack" />

# memory

<p class="api-lead">Variáveis compartilhadas entre os scripts do macro. Os valores ficam guardados até o app fechar ou você limpar — sobrevivem a pausa, à morte e à reconexão.</p>

<script setup>
import { data } from '../.vitepress/data/script-ctx.data.ts';
const ctx = data.interfaces.find((i) => i.name === 'ScriptCtx');
const member = ctx.members.find((m) => m.name === 'memory');
</script>

<ApiSection :member="member" />
