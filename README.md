# Cacao Kitchen

Gioco cooperativo multiplayer per 2 giocatori (sala + cucina) nel browser.

## Stack

| Parte | Tecnologia |
|---|---|
| `client/` | Vite + React (UI/lobby) + Phaser 4 (gioco) + `@colyseus/sdk` |
| `server/` | Node.js + Colyseus 0.18 (server autoritativo) |
| `shared/` | Costanti, tipi dei messaggi e stato sincronizzato (Colyseus Schema) |

## Comandi

```bash
npm install
npm run dev        # server su :2567, client su http://localhost:5173
npm run typecheck
npm run build      # build di produzione del client
```

Per giocare in due: un giocatore clicca **Crea stanza** e condivide il codice, l'altro lo
inserisce e clicca **Entra**. Dalla stessa rete locale si può aprire l'indirizzo "Network"
stampato da Vite.


git add .
git commit -m "feat: new feature description"
