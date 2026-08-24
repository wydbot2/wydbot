<ApiPageHeader ctx="ctx.otherPlayers" kind="entidade · lista" icon="ugroup" />

# otherPlayers

<p class="api-lead">Outros jogadores perto do seu personagem (cerca de 6 tiles).</p>

<script setup>
import { data } from '../.vitepress/data/script-ctx.data.ts';
const ctx = data.interfaces.find((i) => i.name === 'ScriptCtx');
const member = ctx.members.find((m) => m.name === 'otherPlayers');
</script>

<ApiSection :member="member" />
