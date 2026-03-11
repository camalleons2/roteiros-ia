const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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
  // Tabela de usuários
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      email TEXT UNIQUE,
      ip TEXT,
      reset_token TEXT,
      reset_expira INTEGER,
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de créditos diários
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

  // ========== NOVA TABELA DE CÓDIGOS DE ATIVAÇÃO ==========
  db.run(`
    CREATE TABLE IF NOT EXISTS codigos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      usado INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      usado_em DATETIME,
      usuario_id INTEGER,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);
});

console.log(`💾 Banco de dados SQLite atualizado: ${dbPath}`);

// ========== CONFIGURAÇÃO DAS CHAVES GROQ ==========
const apiKeys = [
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2
].filter(key => key);

console.log(`🔑 ${apiKeys.length} chave(s) Groq carregada(s)`);

// Inicializar cliente Groq (se disponível)
let groqAvailable = false;
let groq;
if (apiKeys.length > 0) {
  try {
    const Groq = require('groq-sdk');
    groq = new Groq({ apiKey: apiKeys[0] });
    groqAvailable = true;
    console.log('✅ Cliente Groq inicializado');
  } catch (error) {
    console.log('⚠️ Cliente Groq não disponível (use npm install groq-sdk)');
  }
}

// Sistema de rodízio de chaves
let currentKeyIndex = 0;
const getNextClient = () => {
  if (!groqAvailable) return null;
  const client = new (require('groq-sdk'))({ apiKey: apiKeys[currentKeyIndex] });
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return client;
};

// ========== ROTAS DE ADMIN (GERAR CÓDIGOS) ==========
// Use esta rota para gerar códigos para seus clientes
app.post('/api/admin/gerar-codigos', (req, res) => {
  const { quantidade } = req.body;
  
  if (!quantidade || quantidade < 1) {
    return res.status(400).json({ erro: 'Quantidade inválida' });
  }
  
  const codigos = [];
  const placeholders = [];
  const values = [];
  
  for (let i = 0; i < quantidade; i++) {
    // Gerar código no formato ROTEIROS-ABC123-XYZ789
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
    
    res.json({ 
      sucesso: true, 
      quantidade: quantidade,
      codigos: codigos 
    });
  });
});

// Rota para listar códigos (útil para ver quais já foram usados)
app.get('/api/admin/listar-codigos', (req, res) => {
  db.all('SELECT * FROM codigos ORDER BY criado_em DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ erro: 'Erro ao listar códigos' });
    }
    res.json(rows);
  });
});

// ========== ROTAS DE AUTENTICAÇÃO (MODIFICADAS) ==========

// Rota de login (igual)
app.post('/api/login', (req, res) => {
  const { usuario, senha } = req.body;
  
  db.get('SELECT * FROM usuarios WHERE nome = ? AND senha = ?', [usuario, senha], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro no servidor' });
    }
    
    if (row) {
      res.json({ sucesso: true, usuario: row.nome, usuarioId: row.id });
    } else {
      res.status(401).json({ erro: 'Usuário ou senha inválidos' });
    }
  });
});

// ========== ROTA DE CADASTRO COM CÓDIGO ==========
app.post('/api/cadastro', (req, res) => {
  const { usuario, senha, email, codigo } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  
  // Validar campos
  if (!usuario || !senha || !codigo) {
    return res.status(400).json({ erro: 'Preencha todos os campos' });
  }
  
  // Verificar se o código existe e não foi usado
  db.get('SELECT * FROM codigos WHERE codigo = ? AND usado = 0', [codigo], (err, codigoRow) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro no servidor' });
    }
    
    if (!codigoRow) {
      return res.status(400).json({ erro: '❌ Código de ativação inválido ou já utilizado' });
    }
    
    // Verificar se nome de usuário já existe
    db.get('SELECT id FROM usuarios WHERE nome = ?', [usuario], (err, usuarioRow) => {
      if (usuarioRow) {
        return res.status(400).json({ erro: 'Nome de usuário já existe' });
      }
      
      // Se email foi fornecido, verificar se já existe
      if (email) {
        db.get('SELECT id FROM usuarios WHERE email = ?', [email], (err, emailRow) => {
          if (emailRow) {
            return res.status(400).json({ erro: 'Email já cadastrado' });
          }
        });
      }
      
      // Criar usuário
      db.run(
        'INSERT INTO usuarios (nome, senha, email, ip) VALUES (?, ?, ?, ?)',
        [usuario, senha, email || null, ip],
        function(err) {
          if (err) {
            console.error(err);
            return res.status(500).json({ erro: 'Erro ao criar usuário' });
          }
          
          const usuarioId = this.lastID;
          
          // Marcar código como usado
          db.run(
            'UPDATE codigos SET usado = 1, usado_em = CURRENT_TIMESTAMP, usuario_id = ? WHERE id = ?',
            [usuarioId, codigoRow.id],
            function(err) {
              if (err) {
                console.error(err);
              }
            }
          );
          
          // Criar registro de créditos para hoje
          const hoje = new Date().toISOString().split('T')[0];
          db.run(
            'INSERT INTO creditos (usuario_id, data, usado, limite) VALUES (?, ?, 0, 10)',
            [usuarioId, hoje]
          );
          
          res.json({ 
            sucesso: true, 
            usuario, 
            usuarioId,
            mensagem: '✅ Conta criada com sucesso! Faça login.' 
          });
        }
      );
    });
  });
});

// ========== ROTAS DE CRÉDITOS ==========

// Rota para consultar créditos
app.get('/api/creditos', (req, res) => {
  const { usuarioId } = req.query;
  const hoje = new Date().toISOString().split('T')[0];
  
  if (!usuarioId) {
    return res.status(400).json({ erro: 'usuarioId é obrigatório' });
  }
  
  db.get(
    'SELECT usado, limite FROM creditos WHERE usuario_id = ? AND data = ?',
    [usuarioId, hoje],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: 'Erro no servidor' });
      }
      
      if (row) {
        res.json({
          usado: row.usado,
          limite: row.limite,
          restante: row.limite - row.usado
        });
      } else {
        // Primeiro acesso do dia
        db.run(
          'INSERT INTO creditos (usuario_id, data, usado, limite) VALUES (?, ?, 0, 10)',
          [usuarioId, hoje],
          function(err) {
            if (err) {
              console.error(err);
              return res.status(500).json({ erro: 'Erro no servidor' });
            }
            res.json({ usado: 0, limite: 10, restante: 10 });
          }
        );
      }
    }
  );
});

// Rota para incrementar créditos
app.post('/api/incrementar-creditos', (req, res) => {
  const { usuarioId } = req.body;
  const hoje = new Date().toISOString().split('T')[0];
  
  db.get(
    'SELECT usado, limite FROM creditos WHERE usuario_id = ? AND data = ?',
    [usuarioId, hoje],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: 'Erro no servidor' });
      }
      
      if (row) {
        const novoUsado = row.usado + 1;
        if (novoUsado > row.limite) {
          return res.status(429).json({ erro: 'Limite diário excedido' });
        }
        
        db.run(
          'UPDATE creditos SET usado = ? WHERE usuario_id = ? AND data = ?',
          [novoUsado, usuarioId, hoje],
          function(err) {
            if (err) {
              console.error(err);
              return res.status(500).json({ erro: 'Erro no servidor' });
            }
            res.json({ usado: novoUsado, limite: row.limite, restante: row.limite - novoUsado });
          }
        );
      } else {
        // Primeiro acesso do dia
        db.run(
          'INSERT INTO creditos (usuario_id, data, usado, limite) VALUES (?, ?, 1, 10)',
          [usuarioId, hoje],
          function(err) {
            if (err) {
              console.error(err);
              return res.status(500).json({ erro: 'Erro no servidor' });
            }
            res.json({ usado: 1, limite: 10, restante: 9 });
          }
        );
      }
    }
  );
});

// ========== ROTA DE TESTE ==========
app.get('/api/teste', (req, res) => {
  res.json({ 
    mensagem: '✅ API funcionando!',
    chavesAtivas: apiKeys.length,
    groqDisponivel: groqAvailable,
    banco: 'SQLite com códigos'
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
      ? `Crie um roteiro CURTO (máximo 60 segundos) sobre: "${ideia}".
         ${instrucaoIdioma}
         ${instrucaoTom}
         Formato obrigatório:
         TÍTULO: [título]
         ROTEIRO: [roteiro completo]`
      : `Crie um roteiro LONGO (mínimo 5 minutos) sobre: "${ideia}".
         ${instrucaoIdioma}
         ${instrucaoTom}
         Formato obrigatório:
         TÍTULO: [título]
         ROTEIRO: [roteiro completo]`;

    let lastError = null;
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
        lastError = error;
        
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`💾 Banco SQLite: ${dbPath}`);
  console.log(`📊 Plano: 10 roteiros/dia por usuário (com códigos de ativação)`);
  console.log(`🔑 ${apiKeys.length} chave(s) Groq disponível(eis)`);
  console.log(`🔗 http://localhost:${PORT}/api/teste`);
  console.log(`🆕 Rota admin: http://localhost:${PORT}/api/admin/gerar-codigos (use POST)\n`);
});