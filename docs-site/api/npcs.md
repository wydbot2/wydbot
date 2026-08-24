<ApiPageHeader ctx="ctx.npcs" kind="entidade · lista" icon="users" />

# npcs

<p class="api-lead">NPCs visíveis na sua tela.</p>

<script setup>
import { data } from '../.vitepress/data/script-ctx.data.ts';
const ctx = data.interfaces.find((i) => i.name === 'ScriptCtx');
const member = ctx.members.find((m) => m.name === 'npcs');
</script>

<ApiSection :member="member" />
