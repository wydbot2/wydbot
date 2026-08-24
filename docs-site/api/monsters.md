<ApiPageHeader ctx="ctx.monsters" kind="entidade · lista" icon="skull" />

# monsters

<p class="api-lead">Monstros perto do seu personagem (cerca de 6 tiles).</p>

<script setup>
import { data } from '../.vitepress/data/script-ctx.data.ts';
const ctx = data.interfaces.find((i) => i.name === 'ScriptCtx');
const member = ctx.members.find((m) => m.name === 'monsters');
</script>

<ApiSection :member="member" />
