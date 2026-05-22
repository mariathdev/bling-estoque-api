# Bling Estoque API — Planejamento e Guia de Integração

## Arquitetura

```
Usuario (WhatsApp/Instagram)
         |
         v
    [BotConversa]
    Fluxo com GPT Action
         |
         | (1) GPT identifica o produto
         | (2) BotConversa faz HTTP Action
         v
[bling-estoque-api]         <- voce implanta esta API
Node.js + Express
Middleware inteligente
         |
         | (3) GET /productos?nome=...
         | (4) GET /estoques/{id}
         v
[Bling API v3]             <- fonte de verdade
https://bling.com.br/Api/v3
```

---

## 1. Deploy da API (Railway — recomendado)

### Passos

1. Crie conta em railway.app
2. New Project > Deploy from GitHub repo
3. Suba o projeto `bling-estoque-api` no GitHub
4. Railway detecta o Procfile e faz build automatico
5. Em Settings > Variables, adicione todas as variaveis abaixo:

```
BLING_CLIENT_ID          = <Client ID do seu app Bling>
BLING_CLIENT_SECRET      = <Client Secret do seu app Bling>
BLING_ACCESS_TOKEN       = <access_token atual>
BLING_REFRESH_TOKEN      = <refresh_token atual>
API_SECRET_KEY           = <chave forte que voce inventa, ex: xK9mP2qR7nL4vZ8w>
```

6. Apos deploy, Railway fornece uma URL publica:
   `https://bling-estoque-api-production.up.railway.app`

7. Teste: `GET https://sua-url.railway.app/health`
   Resposta esperada: `{"ok":true,...}`

### Renovacao de tokens

O access_token do Bling expira em 1 hora. A API renova automaticamente
usando o refresh_token. Quando renovar, ela loga os novos tokens no
console do Railway. Se quiser garantia maxima, atualize manualmente as
env vars com os novos tokens apos cada reinicio.

---

## 2. Endpoints da API

### GET /estoque?q={descricao}

Consulta principal. Chamada pelo BotConversa via HTTP Action.

| Parametro | Tipo   | Obrigatorio | Descricao                              |
|-----------|--------|-------------|----------------------------------------|
| q         | string | Sim         | Nome/descricao do produto em linguagem natural |

**Header obrigatorio:**
```
X-API-Key: <sua API_SECRET_KEY>
```

**Exemplos de query:**
- `?q=conjunto eloisa new preto P`
- `?q=kimono azul marinho M`
- `?q=macacao maya terracota G`

**Resposta — produto encontrado:**
```json
{
  "encontrado": true,
  "id": "16627173128",
  "nome": "CONJUNTO ELOISA NEW COR:PRETO;TAMANHO:P",
  "preco": 160.0,
  "estoque": 5,
  "disponivel": true,
  "mensagem": "Sim, temos 5 unidade(s) disponivel(is)."
}
```

**Resposta — sem estoque:**
```json
{
  "encontrado": true,
  "id": "16627173128",
  "nome": "CONJUNTO ELOISA NEW COR:PRETO;TAMANHO:P",
  "preco": 160.0,
  "estoque": 0,
  "disponivel": false,
  "mensagem": "Este produto nao esta disponivel no momento (estoque zerado)."
}
```

**Resposta — ambiguo (faltou cor/tamanho):**
```json
{
  "encontrado": false,
  "ambiguo": true,
  "mensagem": "Encontrei algumas opcoes para este produto. Qual delas voce quer verificar?",
  "opcoes": [
    { "id": "...", "nome": "CONJUNTO ELOISA NEW COR:PRETO;TAMANHO:P" },
    { "id": "...", "nome": "CONJUNTO ELOISA NEW COR:PRETO;TAMANHO:M" }
  ]
}
```

**Resposta — nao encontrado:**
```json
{
  "encontrado": false,
  "mensagem": "Produto nao encontrado para \"xyz\". Verifique o nome do produto."
}
```

---

### GET /estoque/variantes?nome={nome_base}

Lista todas as variantes de um produto com estoque de cada uma.
Util para o GPT montar uma tabela de disponibilidade.

---

## 3. Configuracao no BotConversa

### Passo 1 — Configurar o GPT (Action / Function Calling)

No seu GPT no BotConversa, adicione uma Action (funcao) com este schema:

```json
{
  "name": "consultar_estoque",
  "description": "Consulta o estoque em tempo real de um produto especifico. Use quando o usuario perguntar sobre disponibilidade, quantidade ou se uma peca esta disponivel. Sempre inclua cor e tamanho na query quando o usuario informar.",
  "parameters": {
    "type": "object",
    "properties": {
      "q": {
        "type": "string",
        "description": "Nome completo do produto incluindo cor e tamanho quando mencionados. Exemplos: 'conjunto eloisa new preto P', 'kimono azul marinho M', 'macacao maya terracota G'"
      }
    },
    "required": ["q"]
  }
}
```

**URL da Action:**
```
GET https://sua-url.railway.app/estoque?q={q}
```

**Header da Action:**
```
X-API-Key: <sua API_SECRET_KEY>
```

### Passo 2 — Fluxo no BotConversa

```
[Bloco de entrada do usuario]
         |
         v
[Bloco GPT com a Action configurada]
  - O GPT recebe a mensagem do usuario
  - Identifica que e uma consulta de estoque
  - Chama automaticamente a Action consultar_estoque
  - Recebe o JSON de resposta
  - Formula a resposta em linguagem natural
         |
         v
[Bloco de resposta]
  Usa a variavel com a resposta do GPT
```

### Passo 3 — Prompt do sistema para o GPT

Adicione no System Prompt do GPT no BotConversa:

```
Voce e um assistente de atendimento ao cliente de uma loja de moda feminina.

Quando um cliente perguntar sobre disponibilidade, estoque ou se tem alguma peca:
1. Use a funcao consultar_estoque para verificar o estoque em tempo real
2. Inclua SEMPRE cor e tamanho na query se o cliente mencionar
3. Se "disponivel" for true, informe que temos a peca disponivel
4. Se "disponivel" for false, informe que nao temos em estoque no momento
5. Se "ambiguo" for true, pergunte ao cliente qual variante ele quer (use as "opcoes")
6. Se "encontrado" for false, peca para o cliente descrever melhor o produto

NUNCA invente informacoes de estoque. Sempre consulte a funcao antes de responder.
```

---

## 4. Como Obter os Tokens OAuth2 do Bling

### Fluxo inicial (feito apenas uma vez)

1. Acesse Bling > Configuracoes > API > Meus Aplicativos
2. Crie um novo aplicativo se nao tiver
3. Anote Client ID e Client Secret
4. Acesse a URL de autorizacao:
   ```
   https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=SEU_CLIENT_ID&state=random123
   ```
5. Autorize o acesso
6. Bling redireciona para sua redirect_uri com `?code=AUTHORIZATION_CODE`
7. Troque o code por tokens:
   ```bash
   curl -X POST https://www.bling.com.br/Api/v3/oauth/token \
     -H "Authorization: Basic $(echo -n 'CLIENT_ID:CLIENT_SECRET' | base64)" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code&code=SEU_CODE"
   ```
8. Salve access_token e refresh_token nas env vars do Railway

---

## 5. Verificacao de Funcionamento

Execute estes testes apos o deploy:

```bash
# Health check
curl https://sua-url.railway.app/health

# Consulta com produto existente
curl "https://sua-url.railway.app/estoque?q=conjunto+eloisa+new+preto+P" \
  -H "X-API-Key: sua_api_key"

# Consulta sem tamanho (deve retornar opcoes)
curl "https://sua-url.railway.app/estoque?q=kimono+azul+marinho" \
  -H "X-API-Key: sua_api_key"

# Produto nao existente
curl "https://sua-url.railway.app/estoque?q=produto+inexistente" \
  -H "X-API-Key: sua_api_key"
```

---

## 6. Diagrama do Fluxo Completo

```
Cliente pergunta:
"Tem o conjunto Eloisa New preto tamanho P?"
                    |
                    v
              [BotConversa]
                    |
                    v
         [GPT identifica consulta]
         Chama Action: consultar_estoque
         query: "conjunto eloisa new preto P"
                    |
                    v
         [bling-estoque-api]
         1. Extrai tokens: [CONJUNTO, ELOISA, NEW, PRETO, P]
         2. Busca Bling: GET /produtos?nome=CONJUNTO ELOISA
         3. Rankeia resultados por score de match
         4. Score 1.00: "CONJUNTO ELOISA NEW COR:PRETO;TAMANHO:P"
         5. Busca estoque: GET /estoques/16627173128
         6. saldoFisico: 5
                    |
                    v
         Resposta ao GPT:
         {
           "encontrado": true,
           "nome": "CONJUNTO ELOISA NEW COR:PRETO;TAMANHO:P",
           "estoque": 5,
           "disponivel": true,
           "mensagem": "Sim, temos 5 unidade(s) disponivel(is)."
         }
                    |
                    v
         [GPT formula resposta]
         "Sim! Temos o Conjunto Eloisa New na cor preta
          no tamanho P disponivel. Posso ajudar com mais
          alguma coisa?"
                    |
                    v
              [BotConversa]
                    |
                    v
              [Cliente] recebe resposta
              SEM reiniciar o fluxo
```
