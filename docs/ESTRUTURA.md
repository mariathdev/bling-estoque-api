# Estrutura do projeto

```text
src/
  app.js                         # Monta o app Express sem iniciar porta
  main.js                        # Entrada da aplicacao em runtime
  bin/
    oauth.js                     # CLI para gerar URL OAuth e trocar code por tokens
  config/
    env.js                       # Leitura centralizada de variaveis de ambiente
  controllers/
    estoque.controller.js        # HTTP handlers de estoque
    health.controller.js         # Health check
    oauth.controller.js          # Callback e URL OAuth do Bling
  http/
    middleware/
      api-key.middleware.js      # Autenticacao por X-API-Key
      error.middleware.js        # 404 e handler global de erros
  routes/
    estoque.routes.js            # Rotas publicas da feature de estoque
  services/
    bling.service.js             # Cliente OAuth/API Bling
    estoque.service.js           # Regra de consulta e ranking de estoque
  utils/
    html.js                      # Helpers de HTML
    matcher.js                   # Normalizacao e ranking de produtos

docs/
  INTEGRACAO.md                  # Guia de integracao e deploy
  ESTRUTURA.md                   # Este mapa
  assets/                        # Materiais de apoio nao executaveis
```

## Regra de organizacao

- HTTP fica em `controllers`, `routes` e `http/middleware`.
- Integracoes externas ficam em `services`.
- Configuracao fica em `config/env.js`; evite ler `process.env` espalhado pelo codigo.
- Scripts de operacao ficam em `src/bin`.
- Documentacao e materiais auxiliares ficam em `docs`.
