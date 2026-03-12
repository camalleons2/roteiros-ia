const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

console.log('✅ Backend iniciado');

// ========== CONFIGURAÇÃO DO SQLITE ==========
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Criar tabelas se não existirem
db.serialize(() => {
  db.run(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    email TEXT UNIQUE,
    ip TEXT,
    reset_token TEXT,
    reset_expira INTEGER,
    frase_hash TEXT,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

  db.run(`
    CREATE TABLE IF NOT EXISTS creditos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      usado INTEGER DEFAULT 0,
      limite INTEGER DEFAULT 10,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      UNIQUE(usuario_id, data)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS codigos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      usado INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      usado_em DATETIME,
      usuario_id INTEGER,
      usuario_email TEXT,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  // ========== NOVA TABELA DE DISPOSITIVOS AUTORIZADOS ==========
  db.run(`
    CREATE TABLE IF NOT EXISTS dispositivos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      ultimo_acesso DATETIME DEFAULT CURRENT_TIMESTAMP,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      ativo INTEGER DEFAULT 1,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      UNIQUE(usuario_id, fingerprint)
    )
  `);

  // ========== ÍNDICE PARA BUSCA RÁPIDA ==========
  db.run(`CREATE INDEX IF NOT EXISTS idx_dispositivos_fingerprint ON dispositivos(fingerprint)`);
});

console.log(`💾 Banco de dados SQLite atualizado: ${dbPath}`);

// ========== LISTA DE PALAVRAS BIP39 (ABREVIADA PARA TESTE) ==========
const PALAVRAS_BIP39 = [
  "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse"
];

// ========== FUNÇÃO PARA GERAR FRASE DE RECUPERAÇÃO ==========
function gerarFraseRecuperacao() {
  let frase = [];
  for (let i = 0; i < 12; i++) {
    const randomIndex = crypto.randomInt(0, PALAVRAS_BIP39.length);
    frase.push(PALAVRAS_BIP39[randomIndex]);
  }
  return frase.join(' ');
}

// ========== CONFIGURAÇÃO DAS CHAVES GROQ ==========
const apiKeys = [
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3
].filter(key => key);

console.log(`🔑 ${apiKeys.length} chave(s) Groq carregada(s)`);

let groqAvailable = false;
let groq;
if (apiKeys.length > 0) {
  try {
    const Groq = require('groq-sdk');
    groq = new Groq({ apiKey: apiKeys[0] });
    groqAvailable = true;
    console.log('✅ Cliente Groq inicializado');
  } catch (error) {
    console.log('⚠️ Cliente Groq não disponível');
  }
}

let currentKeyIndex = 0;
const getNextClient = () => {
  if (!groqAvailable) return null;
  const client = new (require('groq-sdk'))({ apiKey: apiKeys[currentKeyIndex] });
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return client;
};

// ========== ROTAS DE ADMIN ==========
app.post('/api/admin/gerar-codigos', (req, res) => {
  const { quantidade } = req.body;
  if (!quantidade || quantidade < 1) {
    return res.status(400).json({ erro: 'Quantidade inválida' });
  }
  const codigos = [];
  const placeholders = [];
  const values = [];
  for (let i = 0; i < quantidade; i++) {
    const parte1 = Math.random().toString(36).substring(2, 8).toUpperCase();
    const parte2 = Math.random().toString(36).substring(2, 8).toUpperCase();
    const codigo = `ROTEIROS-${parte1}-${parte2}`;
    codigos.push(codigo);
    placeholders.push('(?)');
    values.push(codigo);
  }
  const sql = `INSERT INTO codigos (codigo) VALUES ${placeholders.join(',')}`;
  db.run(sql, values, function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao gerar códigos' });
    }
    res.json({ sucesso: true, quantidade: quantidade, codigos: codigos });
  });
});

app.get('/api/admin/listar-codigos', (req, res) => {
  db.all('SELECT * FROM codigos ORDER BY criado_em DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ erro: 'Erro ao listar códigos' });
    }
    res.json(rows);
  });
});

// ========== ROTA DE CADASTRO COM FINGERPRINT ==========
app.post('/api/cadastro', (req, res) => {
  const { usuario, senha, email, codigo, fingerprint } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!usuario || !senha || !codigo) {
    return res.status(400).json({ erro: 'Preencha todos os campos' });
  }

  if (!fingerprint) {
    return res.status(400).json({ erro: 'Erro ao identificar dispositivo' });
  }
  
  db.get('SELECT * FROM codigos WHERE codigo = ? AND usado = 0', [codigo], (err, codigoRow) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro no servidor' });
    }
    if (!codigoRow) {
      return res.status(400).json({ erro: '❌ Código inválido' });
    }
    
    // Verificar se fingerprint já possui conta
    db.get(
      `SELECT u.* FROM usuarios u 
       INNER JOIN dispositivos d ON u.id = d.usuario_id 
       WHERE d.fingerprint = ? AND d.ativo = 1`,
      [fingerprint],
      (err, dispositivoExistente) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ erro: 'Erro no servidor' });
        }
        
        if (dispositivoExistente) {
          return res.status(400).json({ 
            erro: '❌ Este dispositivo já possui uma conta ativa.' 
          });
        }
        
        db.get('SELECT id FROM usuarios WHERE nome = ?', [usuario], (err, usuarioRow) => {
          if (usuarioRow) {
            return res.status(400).json({ erro: 'Nome de usuário já existe' });
          }
          
          const fraseRecuperacao = gerarFraseRecuperacao();
          const fraseHash = crypto.createHash('sha256').update(fraseRecuperacao).digest('hex');
          
          db.run(
            'INSERT INTO usuarios (nome, senha, email, ip, frase_hash) VALUES (?, ?, ?, ?, ?)',
            [usuario, senha, email || null, ip, fraseHash],
            function(err) {
              if (err) {
                console.error(err);
                return res.status(500).json({ erro: 'Erro ao criar usuário' });
              }
              
              const usuarioId = this.lastID;
              
              db.run(
                'UPDATE codigos SET usado = 1, usado_em = CURRENT_TIMESTAMP, usuario_id = ?, usuario_email = ? WHERE id = ?',
                [usuarioId, email || null, codigoRow.id],
                function(err) {
                  if (err) console.error(err);
                }
              );
              
              // Registrar dispositivo
              db.run(
                'INSERT INTO dispositivos (usuario_id, fingerprint) VALUES (?, ?)',
                [usuarioId, fingerprint],
                function(err) {
                  if (err) console.error('Erro ao registrar dispositivo:', err);
                }
              );
              
              const hoje = new Date().toISOString().split('T')[0];
              db.run(
                'INSERT INTO creditos (usuario_id, data, usado, limite) VALUES (?, ?, 0, 10)',
                [usuarioId, hoje]
              );
              
              res.json({ 
                sucesso: true, 
                usuario, 
                usuarioId,
                fraseRecuperacao: fraseRecuperacao,
                mensagem: '✅ Conta criada! GUARDE ESTA FRASE.' 
              });
            }
          );
        });
      }
    );
  });
});

// ========== ROTA DE LOGIN COM FINGERPRINT ==========
app.post('/api/login', (req, res) => {
  const { usuario, senha, fingerprint, codigoDispositivo } = req.body;
  
  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Preencha todos os campos' });
  }

  if (!fingerprint) {
    return res.status(400).json({ erro: 'Erro ao identificar dispositivo' });
  }
  
  db.get('SELECT * FROM usuarios WHERE nome = ? AND senha = ?', [usuario, senha], (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro no servidor' });
    }
    
    if (!user) {
      return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
    }
    
    db.get(
      'SELECT * FROM dispositivos WHERE usuario_id = ? AND fingerprint = ? AND ativo = 1',
      [user.id, fingerprint],
      (err, dispositivo) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ erro: 'Erro no servidor' });
        }
        
        if (dispositivo) {
          db.run('UPDATE dispositivos SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = ?', [dispositivo.id]);
          return res.json({ sucesso: true, usuario: user.nome, usuarioId: user.id });
        }
        
        if (!codigoDispositivo) {
          return res.status(401).json({ 
            erro: 'Dispositivo não reconhecido. Digite seu código de ativação.',
            precisaCodigo: true 
          });
        }
        
        db.get(
          'SELECT * FROM codigos WHERE codigo = ? AND usado = 1 AND usuario_id = ?',
          [codigoDispositivo, user.id],
          (err, codigo) => {
            if (err) {
              console.error(err);
              return res.status(500).json({ erro: 'Erro no servidor' });
            }
            
            if (!codigo) {
              return res.status(401).json({ erro: 'Código de ativação inválido' });
            }
            
            db.get(
              'SELECT COUNT(*) as total FROM dispositivos WHERE usuario_id = ? AND ativo = 1',
              [user.id],
              (err, result) => {
                if (err) {
                  console.error(err);
                  return res.status(500).json({ erro: 'Erro no servidor' });
                }
                
                if (result.total >= 3) {
                  return res.status(401).json({ 
                    erro: 'Limite de dispositivos atingido (máx 3).' 
                  });
                }
                
                db.run(
                  'INSERT INTO dispositivos (usuario_id, fingerprint) VALUES (?, ?)',
                  [user.id, fingerprint],
                  function(err) {
                    if (err) {
                      console.error(err);
                      return res.status(500).json({ erro: 'Erro ao autorizar dispositivo' });
                    }
                    
                    res.json({ 
                      sucesso: true, 
                      usuario: user.nome, 
                      usuarioId: user.id,
                      mensagem: '✅ Novo dispositivo autorizado!'
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});

// ========== ROTA DE RECUPERAÇÃO POR FRASE ==========
app.post('/api/recuperar-frase', (req, res) => {
  const { frase, novaSenha } = req.body;
  if (!frase || !novaSenha) {
    return res.status(400).json({ erro: 'Frase e nova senha são obrigatórios' });
  }
  const fraseHash = crypto.createHash('sha256').update(frase.trim().toLowerCase()).digest('hex');
  db.get('SELECT id, nome FROM usuarios WHERE frase_hash = ?', [fraseHash], (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro no servidor' });
    }
    if (!user) {
      return res.status(400).json({ erro: 'Frase inválida' });
    }
    db.run('UPDATE usuarios SET senha = ? WHERE id = ?', [novaSenha, user.id], function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: 'Erro ao atualizar senha' });
      }
      res.json({ sucesso: true, mensagem: '✅ Senha alterada!', usuario: user.nome });
    });
  });
});

// ========== ROTAS DE CRÉDITOS ==========
app.get('/api/creditos', (req, res) => {
  const { usuarioId } = req.query;
  const hoje = new Date().toISOString().split('T')[0];
  if (!usuarioId) {
    return res.status(400).json({ erro: 'usuarioId é obrigatório' });
  }
  db.get('SELECT usado, limite FROM creditos WHERE usuario_id = ? AND data = ?', [usuarioId, hoje], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro no servidor' });
    }
    if (row) {
      res.json({ usado: row.usado, limite: row.limite, restante: row.limite - row.usado });
    } else {
      db.run('INSERT INTO creditos (usuario_id, data, usado, limite) VALUES (?, ?, 0, 10)', [usuarioId, hoje], function(err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ erro: 'Erro no servidor' });
        }
        res.json({ usado: 0, limite: 10, restante: 10 });
      });
    }
  });
});

app.post('/api/incrementar-creditos', (req, res) => {
  const { usuarioId } = req.body;
  const hoje = new Date().toISOString().split('T')[0];
  db.get('SELECT usado, limite FROM creditos WHERE usuario_id = ? AND data = ?', [usuarioId, hoje], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro no servidor' });
    }
    if (row) {
      const novoUsado = row.usado + 1;
      if (novoUsado > row.limite) {
        return res.status(429).json({ erro: 'Limite diário excedido' });
      }
      db.run('UPDATE creditos SET usado = ? WHERE usuario_id = ? AND data = ?', [novoUsado, usuarioId, hoje], function(err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ erro: 'Erro no servidor' });
        }
        res.json({ usado: novoUsado, limite: row.limite, restante: row.limite - novoUsado });
      });
    } else {
      db.run('INSERT INTO creditos (usuario_id, data, usado, limite) VALUES (?, ?, 1, 10)', [usuarioId, hoje], function(err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ erro: 'Erro no servidor' });
        }
        res.json({ usado: 1, limite: 10, restante: 9 });
      });
    }
  });
});

// ========== ROTA DE TESTE ==========
app.get('/api/teste', (req, res) => {
  res.json({ 
    mensagem: '✅ API funcionando!',
    chavesAtivas: apiKeys.length,
    groqDisponivel: groqAvailable,
    banco: 'SQLite com códigos e dispositivos'
  });
});

// ========== ROTA PRINCIPAL DE GERAÇÃO ==========
app.post('/api/gerar-roteiro', async (req, res) => {
  try {
    const { ideia, tipoVideo, tom, idioma, usuarioId } = req.body;
    if (!usuarioId) {
      return res.status(400).json({ erro: 'Usuário não identificado' });
    }
    console.log(`📥 Usuário ${usuarioId} - ${ideia}`);
    if (!groqAvailable) {
      return res.status(503).json({ erro: 'Serviço de IA indisponível' });
    }
    let instrucaoTom = '';
    switch(tom) {
      case 'engracado': instrucaoTom = 'Use tom engraçado e divertido.'; break;
      case 'serio': instrucaoTom = 'Use tom sério e profissional.'; break;
      case 'motivacional': instrucaoTom = 'Use tom motivacional e inspirador.'; break;
      default: instrucaoTom = 'Use tom normal e equilibrado.';
    }
    let instrucaoIdioma = '';
    switch(idioma) {
      case 'ingles': instrucaoIdioma = 'Write in ENGLISH.'; break;
      case 'espanhol': instrucaoIdioma = 'Escribe en ESPAÑOL.'; break;
      case 'frances': instrucaoIdioma = 'Écrivez en FRANÇAIS.'; break;
      case 'alemao': instrucaoIdioma = 'Schreiben Sie auf DEUTSCH.'; break;
      case 'italiano': instrucaoIdioma = 'Scrivi in ITALIANO.'; break;
      default: instrucaoIdioma = 'Escreva em PORTUGUÊS.';
    }
    const prompt = tipoVideo === 'curto'
      ? `Crie um roteiro CURTO (máximo 60 segundos) sobre: "${ideia}". ${instrucaoIdioma} ${instrucaoTom} Formato obrigatório: TÍTULO: [título] ROTEIRO: [roteiro completo]`
      : `Crie um roteiro LONGO (mínimo 5 minutos) sobre: "${ideia}". ${instrucaoIdioma} ${instrucaoTom} Formato obrigatório: TÍTULO: [título] ROTEIRO: [roteiro completo]`;
    let tentativas = 0;
    while (tentativas < apiKeys.length * 2) {
      tentativas++;
      const client = getNextClient();
      if (!client) {
        return res.status(503).json({ erro: 'Serviço de IA indisponível' });
      }
      try {
        console.log(`📤 Tentando com chave ${(currentKeyIndex % apiKeys.length) + 1}...`);
        const completion = await client.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.7,
          max_tokens: 1024
        });
        const texto = completion.choices[0].message.content;
        console.log('✅ Roteiro gerado com sucesso!');
        return res.json({ resultado: texto });
      } catch (error) {
        console.error(`❌ Erro com chave:`, error.message);
        if (error.status === 429) {
          console.log('⚠️ Rate limit, tentando próxima chave...');
          continue;
        }
      }
    }
    return res.status(500).json({ 
      erro: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.'
    });
  } catch (error) {
    console.error('❌ Erro no servidor:', error);
    res.status(500).json({ erro: error.message });
  }
});

// ========== ROTA ADMIN HTML ==========
app.get('/admin/codigos', (req, res) => {
  db.all('SELECT c.*, u.nome as usuario_nome FROM codigos c LEFT JOIN usuarios u ON c.usuario_id = u.id ORDER BY c.criado_em DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).send('Erro ao buscar códigos');
    }
    const total = rows.length;
    const usados = rows.filter(c => c.usado === 1).length;
    const disponiveis = total - usados;
    let html = `<!DOCTYPE html><html><head><title>Admin - Códigos</title><meta charset="utf-8"><style>body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);padding:20px}.container{max-width:1200px;margin:0 auto;background:white;border-radius:20px;padding:30px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:30px}.stat-card{background:#667eea;color:white;padding:20px;border-radius:10px;text-align:center}.stat-card h3{font-size:2rem;margin:0}table{width:100%;border-collapse:collapse}th{background:#667eea;color:white;padding:12px;text-align:left}td{padding:12px;border-bottom:1px solid #e0e0e0}.usado{background:#ffebee}.disponivel{background:#e8f5e9}</style></head><body><div class="container"><h1>🔐 Admin - Códigos</h1><div class="stats"><div class="stat-card"><h3>${total}</h3><p>Total</p></div><div class="stat-card" style="background:#28a745"><h3>${disponiveis}</h3><p>Disponíveis</p></div><div class="stat-card" style="background:#dc3545"><h3>${usados}</h3><p>Usados</p></div></div><table><thead><tr><th>ID</th><th>Código</th><th>Status</th><th>Usuário</th><th>Criado em</th><th>Usado em</th></tr></thead><tbody>`;
    rows.forEach(codigo => {
      const statusClass = codigo.usado === 1 ? 'usado' : 'disponivel';
      const statusText = codigo.usado === 1 ? '🔴 Usado' : '🟢 Disponível';
      html += `<tr class="${statusClass}"><td>${codigo.id}</td><td><code>${codigo.codigo}</code></td><td>${statusText}</td><td>${codigo.usuario_nome || '-'}</td><td>${codigo.criado_em}</td><td>${codigo.usado_em || '-'}</td></tr>`;
    });
    html += '</tbody></table></div></body></html>';
    res.send(html);
  });
});

// ========== WEBHOOK LASTLINK ==========
app.post('/api/webhook-lastlink', express.json(), async (req, res) => {
  try {
    console.log('📩 Webhook recebido:', req.body);
    const { event, data } = req.body;
    if (event === 'Purchase_Order_Confirmed' && data) {
      const emailCliente = data.customer?.email;
      console.log(`✅ Venda confirmada para: ${emailCliente}`);
      db.get('SELECT codigo FROM codigos WHERE usado = 0 LIMIT 1', [], (err, row) => {
        if (err) {
          console.error('Erro ao buscar código:', err);
          return res.status(500).json({ erro: 'Erro ao buscar código' });
        }
        if (!row) {
          console.error('❌ Nenhum código disponível');
          return res.status(404).json({ erro: 'Sem códigos disponíveis' });
        }
        const codigoAtivacao = row.codigo;
        console.log(`🔑 Código selecionado: ${codigoAtivacao}`);
        db.run(
          'UPDATE codigos SET usado = 1, usado_em = CURRENT_TIMESTAMP, usuario_email = ? WHERE codigo = ?',
          [emailCliente, codigoAtivacao],
          function(err) {
            if (err) {
              console.error('Erro ao marcar código:', err);
              return res.status(500).json({ erro: 'Erro ao atualizar código' });
            }
            console.log(`✅ Código ${codigoAtivacao} marcado para ${emailCliente}`);
            res.json({ sucesso: true, mensagem: 'Código reservado' });
          }
        );
      });
    } else {
      console.log('ℹ️ Evento ignorado:', event);
      res.json({ recebido: true });
    }
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`💾 Banco SQLite: ${dbPath}`);
  console.log(`📊 Plano: 10 roteiros/dia por usuário`);
  console.log(`🔑 ${apiKeys.length} chave(s) Groq`);
  console.log(`🔗 http://localhost:${PORT}/api/teste`);
});