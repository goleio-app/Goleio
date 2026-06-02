# GOLEIO - Etapa 2 Front-end MVP

Este pacote é a primeira versão do front-end do app **Goleio**, usando:

- HTML
- CSS
- JavaScript puro
- Supabase Auth
- Supabase Database
- Supabase Storage
- Lucide Icons

## O que esta etapa já tem

- Login com e-mail e senha
- Cadastro sem confirmação de e-mail, desde que isso esteja desligado no Supabase
- Criação automática/garantia de perfil
- Edição de perfil/cartinha
- Upload de foto no bucket `avatars`
- Criar vários rachas
- Entrar em racha por código de convite
- Entrada pendente até admin aprovar
- Admin aprova/remove membros
- Lista de membros do racha
- Confirmação de presença por data
- Ranking por avaliação
- Avaliação de jogador por notas de 1 a 5
- Sorteio aleatório ou equilibrado por nota
- Copiar times para WhatsApp

## Antes de rodar

1. Rode o arquivo SQL da etapa 1 no Supabase.
2. No Supabase, vá em:

`Authentication > Sign In / Providers > Email`

3. Deixe:

- `Allow new users to sign up`: ligado
- `Confirm email`: desligado

4. Vá em:

`Project Settings > API`

5. Copie:

- Project URL
- anon public key

6. Abra o arquivo:

`js/config.js`

7. Preencha:

```js
window.GOLEIO_SUPABASE_URL = "SUA_URL";
window.GOLEIO_SUPABASE_ANON_KEY = "SUA_ANON_KEY";
```

Nunca coloque a `service_role key` no front-end.

## Como testar localmente

Você pode abrir com a extensão **Live Server** do VS Code.

Também pode rodar com Python:

```bash
cd goleio-mvp
python -m http.server 5500
```

Depois acesse:

`http://localhost:5500`

## Fluxo de teste recomendado

1. Crie um usuário admin.
2. Crie um racha.
3. Copie o código do racha.
4. Saia da conta.
5. Crie um segundo usuário.
6. Entre no racha pelo código.
7. Volte para o admin.
8. Aprove o jogador.
9. Confirme presença.
10. Avalie o jogador.
11. Gere o sorteio.

## Observações importantes

- Recuperação de senha por e-mail não foi colocada no MVP para evitar limite de e-mails.
- A mensagem no app é: “Esqueceu a senha? Fale com o administrador do racha.”
- As fotos usam o bucket público `avatars`, criado no SQL da etapa 1.
- O sorteio equilibrado usa as notas do ranking. Quando o jogador não tem nota, o app usa nota padrão 3.

## Próxima etapa sugerida

Depois de testar essa base, o próximo passo é polir:

- Tela de cronômetro e placar integrada ao layout premium
- Histórico de jogos
- Craque da rodada
- Melhorias no algoritmo para separar craques/panelinhas
- Ajustes finos de mobile

## Etapa 13 — Administração do racha

Antes de usar o cancelamento de datas, rode no Supabase SQL Editor o arquivo:

`GOLEIO_13_ADMIN_RACHA_SQL.sql`

Novidades:

- Admin pode editar nome, modalidade, local/endereço, dia do racha, horário, jogadores por time e máximo de jogadores.
- Admin pode cancelar uma data específica, por exemplo uma semana sem racha.
- Datas canceladas não aparecem para presença nem sorteio.
- Admin pode reativar uma data cancelada.

## Etapa 15 - Login atualizado

- Botão para mostrar/ocultar senha no login e no cadastro.
- Máscara automática para WhatsApp no formato `(xx) xxxxx-xxxx`.
- Tela de autenticação mais limpa, sem textos explicativos desnecessários para o usuário final.
- Ajuste de espaçamento no mobile para evitar corte no formulário de cadastro.


## Logos e ícones do Goleio

Esta versão já está preparada para receber as logos na pasta:

```txt
assets/logos/
```

Arquivos principais usados pelo app:

```txt
assets/logos/goleio-icon-192.png        -> logo pequena no login, menu e cartinhas
assets/logos/goleio-icon-512.png        -> ícone PWA/app
assets/logos/favicon-48x48.png          -> favicon do navegador
assets/logos/apple-touch-icon.png       -> ícone iPhone/iPad
assets/logos/goleio-logo-master.png     -> versão master transparente
manifest.json                           -> configura ícone e nome do app instalado
```

Para trocar a logo futuramente, mantenha os mesmos nomes dos arquivos acima e substitua as imagens dentro de `assets/logos/`.
Depois atualize a página com `Ctrl + F5` para limpar o cache do navegador.
