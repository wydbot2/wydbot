<ApiPageHeader ctx="ctx.player" kind="entidade · estado do jogo" icon="user" />

# player

<p class="api-lead">Estado do seu personagem.</p>

<script setup>
import { data } from '../.vitepress/data/script-ctx.data.ts';
const ctx = data.interfaces.find((i) => i.name === 'ScriptCtx');
const member = ctx.members.find((m) => m.name === 'player');
</script>

<ApiSection :member="member" />
