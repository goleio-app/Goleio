# Como colocar as logos no Goleio

## 1. Pasta correta

Coloque as logos dentro desta pasta do projeto:

```txt
assets/logos/
```

Nesta versão eu já deixei a pasta pronta com os principais tamanhos.

## 2. Arquivos que o app usa

O app procura estes arquivos:

```txt
assets/logos/goleio-icon-192.png
assets/logos/goleio-icon-512.png
assets/logos/favicon-48x48.png
assets/logos/apple-touch-icon.png
assets/logos/goleio-logo-master.png
```

## 3. Onde aparecem

- `goleio-icon-192.png`: aparece no login, menu lateral, menu mobile e cartinha.
- `goleio-icon-512.png`: usado pelo `manifest.json` para instalar como app/PWA.
- `favicon-48x48.png`: aparece na aba do navegador.
- `apple-touch-icon.png`: usado quando salvar na tela inicial do iPhone.
- `goleio-logo-master.png`: arquivo principal transparente para usos futuros.

## 4. Como trocar depois

Se você gerar uma logo melhor, basta substituir os arquivos mantendo os mesmos nomes.

Exemplo:

```txt
nova-logo-192.png -> renomeia para goleio-icon-192.png
nova-logo-512.png -> renomeia para goleio-icon-512.png
```

Depois rode o app novamente e aperte `Ctrl + F5` no navegador.

## 5. Arquivos alterados nessa versão

```txt
index.html
css/style.css
js/app.js
manifest.json
assets/logos/
```

Não precisa rodar SQL novo no Supabase.
