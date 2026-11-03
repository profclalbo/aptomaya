# Apto 4 Maya - site de temporada individual

Site de aluguel por temporada só das suas unidades na Pousada Lua Sol e Mar.
Começa com o Apto 4 (codinome Maya) e já está pronto para você colocar outros apartamentos ou kitnets depois, usando a mesma estrutura.

| Endereço | O que é |
|---|---|
| `/` | Capa com popup de ofertas, atalhos de Natal e Réveillon e busca por datas |
| `/#/unidade/apto-4` | Página do Apto 4: fotos, pacotes, calendário, valores e botão Reservar |
| `/#/reserva/CODIGO/...` | Página do hóspede: Pix do sinal, documentos, contrato e Pix do restante |
| `/app` | Painel do proprietário (senha provisória: **lua2026**, você troca no primeiro acesso) |

Este projeto é separado do site geral da pousada (lua-sol-e-mar). Cada um tem o seu GitHub, o seu projeto na Vercel, o seu banco e os seus arquivos. Não misture os dois.

---

## Parte 1 - Subir no GitHub

### Opção A (mais fácil): pelo site do GitHub
1. Descompacte o zip. Vai aparecer a pasta **apto-maya**.
2. Abra https://github.com/new
3. Em **Repository name** escreva `apto-maya`.
4. Marque **Private**.
5. Clique em **Create repository**.
6. Na página que abrir, clique no link **uploading an existing file**.
7. Abra a pasta **apto-maya** no Finder, selecione **tudo o que está dentro dela** (Cmd + A) e arraste para a página do GitHub.
   - Atenção: arraste o conteúdo da pasta, e não a pasta.
   - Confira se aparecem as pastas `api` e `assets` e os arquivos `index.html`, `app.html`, `package.json` e `vercel.json`.
   - O Finder esconde os arquivos que começam com ponto (.gitignore, .vercelignore, .env.example). Isso não atrapalha.
8. Embaixo, clique em **Commit changes**.

### Opção B: pelo Terminal do Mac
1. Crie o repositório como nos passos 2 a 5 da Opção A.
2. Abra o **Terminal** (Cmd + Espaço, digite Terminal, Enter) e cole um comando por vez:

```bash
cd ~/Downloads/apto-maya
git init
git add .
git commit -m "Primeira versão"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/apto-maya.git
git push -u origin main
```

Troque `SEU-USUARIO` pelo seu usuário do GitHub. Se o GitHub pedir login, siga a janela do navegador que abrir.

---

## Parte 2 - Publicar na Vercel

1. Abra https://vercel.com/new
2. Em **Import Git Repository**, clique em **Import** ao lado de `apto-maya`.
3. Em **Project Name**, deixe `apto-maya` (ou outro nome). Esse nome vira o endereço `apto-maya.vercel.app`.
4. **Framework Preset**: deixe **Other**. Não mexa em Build Command nem Output Directory.
5. Clique em **Deploy** e espere terminar.

### 2.1 - Ligar o banco que você já tem (obrigatório)
Você vai usar o mesmo Upstash do site geral. Não precisa criar outro nem pagar nada.
O código já separa tudo: o site geral guarda os dados na gaveta `lsm:` e este projeto na gaveta `maya:`. Um não enxerga o outro.

1. Na Vercel, no topo da tela, clique na aba **Storage** (a do seu time/conta, não a de dentro do projeto).
2. Clique no banco Upstash (Redis) que você já tem.
3. Clique em **Connect Project** (ou na aba **Projects** e depois em **Connect Project**).
4. Escolha o projeto `apto-maya`.
5. Deixe marcados **Development**, **Preview** e **Production**.
6. Se aparecer o campo **Custom Prefix** (prefixo das variáveis), não mexa: deixe como vier.
7. Clique em **Connect**.
8. Confira: entre no projeto `apto-maya` > **Settings** > **Environment Variables**. Precisam aparecer `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
   - Se aparecerem com outro começo (ex.: `STORAGE_KV_REST_API_URL`), crie as duas com os nomes exatos `KV_REST_API_URL` e `KV_REST_API_TOKEN`, copiando os valores das que vieram.
9. Faça o Redeploy (Deployments > três pontinhos do último deploy > **Redeploy**).

Atenção: não cadastre a variável `BANCO_PREFIXO`. Ela só existe para emergência. Se colocar `lsm:` aqui, este site passa a ler os dados do site geral.

### 2.2 - Ligar os arquivos (obrigatório)
1. Dentro do projeto `apto-maya`, clique na aba **Storage**, depois em **Create Database** e escolha **Blob** (é grátis e fica separado do site geral).
2. Dê o nome `apto-maya-arquivos` e conecte ao projeto.
   - Os documentos dos hóspedes e os contratos ficam guardados **criptografados**.
   - Mesmo que alguém descubra o endereço do arquivo, não consegue ler.
   - Só abrem pelo app, com um link que vence em 30 minutos.

### 2.3 - Variáveis (Settings > Environment Variables)
Cada variável é cadastrada assim: **Key** (nome) + **Value** (valor) e depois **Save**.

| Key | Value | Obrigatória? |
|---|---|---|
| `APP_SECRET` | uma frase longa só sua, ex.: `apto-maya-2026-segredo-do-matheus-7c6b5a` | recomendada |
| `PAPI_INSTANCIA` | `motorista` (ou a instância que for usar) | só para WhatsApp automático |
| `PAPI_CHAVE` | a chave da sua instância na PAPI | só para WhatsApp automático |
| `AUTENTIQUE_TOKEN` | a chave da API da Autentique (painel.autentique.com.br > Perfil > API) | só para assinatura automática |
| `AUTENTIQUE_SANDBOX` | `1` para testar sem custo / `0` para valer | junto com a Autentique |
| `AUTENTIQUE_WEBHOOK_SECRET` | o segredo que a Autentique mostra ao criar o webhook | junto com a Autentique |
| `ADMIN_SENHA` | só use se o proprietário esquecer a senha e não tiver WhatsApp automático | emergência |

**Importante:** depois de criar ou mudar variáveis, vá em **Deployments**, clique nos **três pontinhos** do último deploy e em **Redeploy**. As variáveis só valem depois disso.

Sem PAPI e sem Autentique o app funciona do mesmo jeito:
- os botões abrem o WhatsApp com a mensagem pronta;
- o contrato é assinado pelo gov.br (grátis).

### 2.4 - Webhook da Autentique (para o contrato atualizar sozinho quando assinarem)
1. No painel da Autentique, procure **Webhooks** (área de desenvolvedor) e crie um endpoint com a URL:
   `https://apto-maya.vercel.app/api/autentique`
2. Marque os eventos **document.finished** e **signature.accepted**.
3. Copie o segredo que aparecer e cadastre na Vercel como `AUTENTIQUE_WEBHOOK_SECRET`.
4. Faça o Redeploy.

Sem webhook também funciona: na reserva, o dono toca em **Atualizar assinaturas**.

---

## Parte 3 - Primeiro uso (roteiro de teste)

1. Abra `https://apto-maya.vercel.app/app`.
   - Entre com **lua2026**.
   - O painel pede uma senha nova: crie e anote.
2. Em **Ajustes**:
   - Confira se Banco e Arquivos estão com bolinha verde.
   - Coloque o seu WhatsApp em Proprietário e salve.
   - Toque em **Testar WhatsApp** (se a PAPI estiver ligada).
3. Em **Meus dados** (no celular, em "Mais"):
   - Preencha os seus dados de locador e o seu Pix.
   - Valem para os contratos e o Pix de todas as suas unidades.
4. Em **Unidades** > **Anúncio** do Apto 4:
   - Confira título, descrição, diária (R$ 300), sinal (50%) e os pacotes de Natal e Réveillon.
   - Envie as fotos do apartamento e salve.
5. Em **Anúncios**: veja o popup (Apartamentos, Réveillon e Natal), o tempo na tela e os textos da capa.
6. Abra o site `/` no celular:
   - O popup aparece e some sozinho em 3,5 segundos.
   - Escolha datas, reserve com dados de teste e envie fotos de documento.
   - Na reserva, toque em **Já paguei** (o Pix é só do sinal de 50%).
7. No painel, em **Início**, toque no aviso do Pix e depois em **Pagamento recebido - confirmar**. O contrato em PDF é gerado.
8. Na página do hóspede aparece o Pix do restante. Quando ele pagar na chegada, toque em **Restante recebido** na reserva.

### Como funciona
- **Popup de ofertas:** aparece uma vez por visita e some em 3,5 segundos (dá para mudar de 2 a 10 em Anúncios). Tem X grande, fecha tocando fora e para de contar quando a pessoa toca nele.
  - Cada visita começa por um anúncio diferente. Depois fica o botão "Ofertas".
  - Quando o hóspede escolhe as datas, o botão vira "Reservar Apto 4" (ou "Ver X unidades livres", se tiver mais de uma).
- **Pacotes:** de 23 a 27/12 (Natal) e de 29/12 a 03/01 (Réveillon) só dá para reservar o pacote inteiro, com entrada às 17h e saída às 16h.
  - Valor do casal + cada acompanhante a partir de 6 anos. Crianças menores não pagam (o site calcula pela data de nascimento na entrada).
  - Natal: casal R$ 2.000 + R$ 500 por acompanhante. Réveillon: casal R$ 3.000 + R$ 600 por acompanhante. Confira esses valores no anúncio antes de divulgar.
- **Documentos dos hóspedes:** só o do titular é obrigatório (maior de 18 anos, com documento com foto). Dos outros hóspedes são obrigatórios o nome e a data de nascimento; o documento é opcional. Cada documento pode ir como frente e verso separados ou como documento completo (um arquivo só, foto ou PDF).
- **Caução / reserva em %:** no anúncio, a caução é o sinal em porcentagem (padrão 50%), descontado do total. Não existe mais caução em reais.
- **Datas especiais = pacotes:** não existe mais diária especial. Nas datas especiais o hóspede reserva o pacote inteiro: casal (2 pessoas) + valor por acompanhante a partir de 6 anos, até 3 acompanhantes (máximo 5 pessoas). Cada pacote tem a sua taxa de limpeza, editável.
- **Aceite por código (assinatura eletrônica):** ao confirmar a reserva, escolha "Aceite por código". O hóspede lê o contrato, recebe um código de 6 números no WhatsApp e confirma; o dono aceita no painel. O PDF final sai com uma página de comprovação (nomes, CPF, data e hora, IP, aparelho e código de integridade SHA-256). Precisa da PAPI ligada. Pode virar o padrão em Ajustes > Temporada > Assinatura padrão.
- **Sinal e restante:** o hóspede paga o sinal (50%) no Pix para garantir as datas e o restante no dia da chegada, pelo Pix que aparece na página da reserva. O sinal é descontado do total e não é devolvido se o hóspede desistir.
- **Valores padrão:** diária R$ 300, limpeza R$ 60, até 5 pessoas, entrada 17h e saída 16h. Tudo pode ser mudado no anúncio de cada unidade.
- **Fotos:** as fotos comuns da pousada (Ajustes > Fotos da capa) aparecem em todas as unidades. As fotos próprias de cada unidade (Anúncio > Fotos) aparecem primeiro.
- **Falar com o proprietário:** a página de cada unidade tem o botão do WhatsApp (o seu número de Meus dados; se estiver vazio, o de Ajustes).

### Colocar outra unidade (apartamento ou kitnet)
1. Painel > **Unidades** > **Nova unidade**.
2. Escolha o tipo (Apartamento, Kitnet de cima ou Kitnet de frente), o número, o nome e, se quiser, um codinome. Salve.
3. Toque em **Anúncio** da unidade nova, ajuste valores e fotos e salve.
   - Apartamento começa com diária de R$ 300 e kitnet com R$ 275, sinal de 50% e os pacotes.
4. Com kitnet no site, a capa passa a mostrar os filtros Apartamentos e Kitnets. Se quiser, adicione o anúncio de kitnets em **Anúncios**.

### Recuperar a senha
- No login, toque em "Esqueci a senha". O código chega no WhatsApp cadastrado em Ajustes (precisa da PAPI).
- Sem PAPI: cadastre a variável `ADMIN_SENHA` na Vercel com uma senha nova e faça o Redeploy. Essa senha passa a valer.

---

## Testar no computador antes de subir (opcional)
Precisa do Node.js instalado (https://nodejs.org, versão LTS). No Terminal:

```bash
cd ~/Downloads/apto-maya
npm install
npm run dev
```

Abra http://localhost:3000. No computador os dados ficam num arquivo temporário (sem banco). Para parar, aperte Ctrl + C no Terminal.

---

## Observações
- **Contrato:** é um modelo de locação para temporada (Lei 8.245/91, arts. 48 a 50) e precisa ser revisado antes do uso real. Você pode acrescentar cláusulas no anúncio.
- **Mesmo código do site geral:** a diferença está no arquivo `api/_lib/modo.js` (`individual`). Se um dia quiser trocar sem mexer no código, cadastre na Vercel a variável `SITE_MODO` com `individual` ou `condominio`.
