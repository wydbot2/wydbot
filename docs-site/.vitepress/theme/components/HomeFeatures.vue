<script setup lang="ts">
// Custom home: wordmark + title + tagline + actions + 3 feature cards.
import { withBase } from 'vitepress';
import { BookOpenIcon, CircleStackIcon, TagIcon } from '@heroicons/vue/20/solid';
</script>

<template>
  <div class="api-home">
    <img class="mark" :src="withBase('/wydbot-logo-white.svg')" alt="wydbot" width="135" height="44" />
    <h1>Script <span class="accent">API</span></h1>
    <p class="tag">
      Documentação da API exposta a scripts de macro do wydbot.com — escreva steps
      <code>script</code> com acesso total ao <code>ctx</code>.
    </p>
    <div class="api-home-actions">
      <a class="api-btn api-btn--brand" :href="withBase('/guias/primeiros-passos')">Primeiros passos</a>
      <a class="api-btn api-btn--alt" :href="withBase('/api/player')">Referência da API</a>
    </div>
    <div class="api-features">
      <a class="api-feature" :href="withBase('/guias/primeiros-passos')">
        <span class="fic"><BookOpenIcon aria-hidden="true" /></span>
        <h3>Guias</h3>
        <p>Do zero ao primeiro script funcional: o que é um step <code>script</code> e como o engine executa.</p>
      </a>
      <a class="api-feature" :href="withBase('/api/player')">
        <span class="fic"><CircleStackIcon aria-hidden="true" /></span>
        <h3>Referência da API</h3>
        <p>Estado do jogo (<code>player</code>, <code>npcs</code>, <code>monsters</code>), controle do macro e ações (<code>log</code>, <code>alert</code>).</p>
      </a>
      <a class="api-feature" :href="withBase('/api/item')">
        <span class="fic"><TagIcon aria-hidden="true" /></span>
        <h3>Tipos</h3>
        <p>Os formatos de dado compartilhados: <code>Item</code>, <code>Entidade</code> e <code>ItemShort</code>.</p>
      </a>
    </div>
  </div>
</template>
