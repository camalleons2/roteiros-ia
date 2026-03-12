import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'https://roteiros-ia.onrender.com';
console.log('🌐 Conectando ao backend:', API_URL);

function App() {
  // ========== TODOS OS STATES ==========
  const [ideia, setIdeia] = useState('');
  const [tipoVideo, setTipoVideo] = useState('curto');
  const [tom, setTom] = useState('normal');
  const [idiomaRoteiro, setIdiomaRoteiro] = useState('portugues');
  const [roteiroGerado, setRoteiroGerado] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [creditos, setCreditos] = useState({ usado: 0, limite: 10, restante: 10 });
  const [copiado, setCopiado] = useState(false);
  const [mostrarPopup, setMostrarPopup] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(0);
  const [mostrarTemplates, setMostrarTemplates] = useState(false);
  
  // ========== STATES PARA LOGIN ==========
  const [usuario, setUsuario] = useState(null);
  const [usuarioId, setUsuarioId] = useState(null);
  const [mostrarLogin, setMostrarLogin] = useState(false);
  const [modoLogin, setModoLogin] = useState('login');
  const [mostrarCampoCodigo, setMostrarCampoCodigo] = useState(false);
  const [codigoDispositivo, setCodigoDispositivo] = useState('');
  
  // Formulário de login
  const [formLogin, setFormLogin] = useState({ usuario: '', senha: '' });
  
  // ========== FORMULÁRIO DE CADASTRO COM CÓDIGO ==========
  const [formCadastro, setFormCadastro] = useState({ 
    usuario: '', 
    senha: '', 
    confirmarSenha: '',
    email: '',
    codigo: '' 
  });
  
  // ========== NOVOS STATES PARA RECUPERAÇÃO POR FRASE ==========
  const [modoRecuperacao, setModoRecuperacao] = useState(false);
  const [fraseRecuperacao, setFraseRecuperacao] = useState('');
  const [novaSenhaRecuperacao, setNovaSenhaRecuperacao] = useState('');
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState('');
  const [fraseGerada, setFraseGerada] = useState('');
  const [mostrarFrase, setMostrarFrase] = useState(false);
  
  const [erroLogin, setErroLogin] = useState('');
  
  const timerRef = useRef(null);
  const resultadoRef = useRef();

  // Templates (22 opções com emojis)
  const templates = [
    { nome: "🎥 Review de Filme", ideia: "Review completo do filme [nome do filme]" },
    { nome: "🍳 Receita Rápida", ideia: "Receita simples de [nome da receita]" },
    { nome: "💪 Dicas de Treino", ideia: "Rotina de treino para [objetivo]" },
    { nome: "📚 Dicas de Estudo", ideia: "Técnicas de estudo para [matéria]" },
    { nome: "💰 Dicas de Finanças", ideia: "Como organizar finanças" },
    { nome: "✈️ Roteiro de Viagem", ideia: "Roteiro para viajar para [destino]" },
    { nome: "💻 Dicas de Tecnologia", ideia: "Dicas sobre [app/software]" },
    { nome: "🌱 Sustentabilidade", ideia: "Dicas para vida sustentável" },
    { nome: "🎮 Review de Game", ideia: "Review do jogo [nome do jogo]" },
    { nome: "🎵 Review Musical", ideia: "Análise da música/álbum [nome]" },
    { nome: "📺 Sobre Série", ideia: "Review da série [nome]" },
    { nome: "🥗 Receita Saudável", ideia: "Receita saudável de [nome]" },
    { nome: "🍰 Sobremesa", ideia: "Receita de sobremesa [nome]" },
    { nome: "🧘 Meditação", ideia: "Guia de meditação para [iniciantes]" },
    { nome: "😴 Higiene do Sono", ideia: "Dicas para melhorar o sono" },
    { nome: "✍️ Dicas de Redação", ideia: "Dicas para escrever sobre [tema]" },
    { nome: "🧠 Memorização", ideia: "Técnicas de memorização" },
    { nome: "📖 Resumo de Livro", ideia: "Resumo do livro [nome]" },
    { nome: "🏡 Decoração", ideia: "Dicas de decoração para [cômodo]" },
    { nome: "👶 Dicas para Pais", ideia: "Dicas para pais sobre [tema]" },
    { nome: "🐶 Cuidados com Pets", ideia: "Dicas para cuidar de [pet]" },
    { nome: "📱 Redes Sociais", ideia: "Dicas para crescer no [Instagram/TikTok]" }
  ];

  // Verificar se já tem usuário logado ao iniciar
  useEffect(() => {
    const usuarioSalvo = localStorage.getItem('usuario');
    const usuarioIdSalvo = localStorage.getItem('usuarioId');
    
    if (usuarioSalvo && usuarioIdSalvo) {
      setUsuario(usuarioSalvo);
      setUsuarioId(parseInt(usuarioIdSalvo));
      buscarCreditos(parseInt(usuarioIdSalvo));
    }
  }, []);

  // Buscar créditos do usuário no backend
  const buscarCreditos = async (id) => {
    try {
      const response = await axios.get(`${API_URL}/api/creditos?usuarioId=${id}`);
      setCreditos(response.data);
    } catch (error) {
      console.error('Erro ao buscar créditos:', error);
    }
  };

  // ========== FUNÇÃO PARA GERAR FINGERPRINT DO DISPOSITIVO ==========
  const gerarFingerprint = async () => {
    try {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      return result.visitorId; // Identificador único do dispositivo
    } catch (error) {
      console.error('Erro ao gerar fingerprint:', error);
      return null;
    }
  };

  // ========== FUNÇÃO DE LOGIN COM FINGERPRINT ==========
  const handleLogin = async () => {
    if (!formLogin.usuario || !formLogin.senha) {
      setErroLogin('Preencha todos os campos');
      return;
    }

    // Gerar fingerprint do dispositivo
    const fingerprint = await gerarFingerprint();
    if (!fingerprint) {
      setErroLogin('Erro ao identificar seu dispositivo. Tente novamente.');
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/api/login`, {
        usuario: formLogin.usuario,
        senha: formLogin.senha,
        fingerprint: fingerprint,
        codigoDispositivo: codigoDispositivo || null
      });

      if (response.data.sucesso) {
        setUsuario(response.data.usuario);
        setUsuarioId(response.data.usuarioId);
        localStorage.setItem('usuario', response.data.usuario);
        localStorage.setItem('usuarioId', response.data.usuarioId);
        setMostrarLogin(false);
        setFormLogin({ usuario: '', senha: '' });
        setCodigoDispositivo('');
        setMostrarCampoCodigo(false);
        setErroLogin('');
        buscarCreditos(response.data.usuarioId);
        
        if (response.data.mensagem) {
          alert(response.data.mensagem);
        }
      }
    } catch (error) {
      if (error.response && error.response.data) {
        if (error.response.data.precisaCodigo) {
          setMostrarCampoCodigo(true);
          setErroLogin('Digite seu código de ativação para autorizar este dispositivo.');
        } else {
          setErroLogin(error.response.data.erro || 'Erro no servidor');
        }
      } else {
        setErroLogin('Erro no servidor. Tente novamente.');
      }
    }
  };

  // ========== FUNÇÃO DE CADASTRO COM CÓDIGO E FINGERPRINT ==========
  const handleCadastro = async () => {
    if (!formCadastro.usuario || !formCadastro.senha || !formCadastro.confirmarSenha || !formCadastro.codigo) {
      setErroLogin('Preencha todos os campos obrigatórios (usuário, senha, código)');
      return;
    }

    if (formCadastro.senha !== formCadastro.confirmarSenha) {
      setErroLogin('As senhas não coincidem');
      return;
    }

    // Gerar fingerprint do dispositivo
    const fingerprint = await gerarFingerprint();
    if (!fingerprint) {
      setErroLogin('Erro ao identificar seu dispositivo. Tente novamente.');
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/api/cadastro`, {
        usuario: formCadastro.usuario,
        senha: formCadastro.senha,
        email: formCadastro.email || null,
        codigo: formCadastro.codigo,
        fingerprint: fingerprint
      });

      if (response.data.sucesso) {
        setFraseGerada(response.data.fraseRecuperacao);
        
        setUsuario(response.data.usuario);
        setUsuarioId(response.data.usuarioId);
        localStorage.setItem('usuario', response.data.usuario);
        localStorage.setItem('usuarioId', response.data.usuarioId);
        
        setFormCadastro({ usuario: '', senha: '', confirmarSenha: '', email: '', codigo: '' });
        setErroLogin('');
        buscarCreditos(response.data.usuarioId);
        setMostrarFrase(true);
      }
    } catch (error) {
      if (error.response && error.response.data && error.response.data.erro) {
        if (error.response.data.erro.includes('dispositivo')) {
          setErroLogin('❌ Este dispositivo já possui uma conta ativa. Cada dispositivo só pode ter uma conta.');
        } else {
          setErroLogin(error.response.data.erro);
        }
      } else {
        setErroLogin('Erro no servidor. Tente novamente.');
      }
    }
  };

  // ========== FUNÇÃO DE RECUPERAÇÃO POR FRASE ==========
  const handleRecuperarPorFrase = async () => {
    if (!fraseRecuperacao || !novaSenhaRecuperacao || !confirmarNovaSenha) {
      setErroLogin('Preencha todos os campos');
      return;
    }

    if (novaSenhaRecuperacao !== confirmarNovaSenha) {
      setErroLogin('As senhas não coincidem');
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/api/recuperar-frase`, {
        frase: fraseRecuperacao.trim().toLowerCase(),
        novaSenha: novaSenhaRecuperacao
      });

      if (response.data.sucesso) {
        setErroLogin('');
        setModoRecuperacao(false);
        setFraseRecuperacao('');
        setNovaSenhaRecuperacao('');
        setConfirmarNovaSenha('');
        
        alert('✅ Senha alterada com sucesso! Faça login com sua nova senha.');
        setModoLogin('login');
      }
    } catch (error) {
      if (error.response && error.response.data && error.response.data.erro) {
        setErroLogin(error.response.data.erro);
      } else {
        setErroLogin('Erro no servidor. Tente novamente.');
      }
    }
  };

  // Logout
  const fazerLogout = () => {
    setUsuario(null);
    setUsuarioId(null);
    localStorage.removeItem('usuario');
    localStorage.removeItem('usuarioId');
    setCreditos({ usado: 0, limite: 10, restante: 10 });
  };

  // ========== FUNÇÕES DE ROTEIRO ==========
  const processarResposta = (texto) => {
    const linhas = texto.split('\n');
    let titulo = '';
    let roteiro = [];
    let secaoAtual = '';
    
    linhas.forEach(linha => {
      const linhaTrim = linha.trim();
      
      if (linhaTrim.toLowerCase().startsWith('título:') || 
          linhaTrim.toLowerCase().startsWith('titulo:') ||
          linhaTrim.toLowerCase().startsWith('title:')) {
        secaoAtual = 'titulo';
        titulo = linha.replace(/TÍTULO:|TITULO:|TITLE:|título:|titulo:|title:/i, '').trim();
      }
      else if (linhaTrim.toLowerCase().startsWith('roteiro:') ||
               linhaTrim.toLowerCase().startsWith('script:')) {
        secaoAtual = 'roteiro';
      }
      else if (secaoAtual === 'roteiro' && linhaTrim !== '') {
        roteiro.push(linha);
      }
    });
    
    return { titulo, roteiro };
  };

  const gerarRoteiro = async () => {
    if (!ideia.trim()) {
      setErro('Digite uma ideia');
      return;
    }

    if (!usuarioId) {
      setErro('Faça login para gerar roteiros');
      setMostrarLogin(true);
      return;
    }

    if (creditos.usado >= creditos.limite) {
      setErro('Você atingiu seu limite diário de 10 roteiros');
      return;
    }

    setLoading(true);
    setErro('');

    try {
      const response = await axios.post(`${API_URL}/api/gerar-roteiro`, {
        ideia,
        tipoVideo,
        tom,
        idioma: idiomaRoteiro,
        usuarioId
      });
      
      const processado = processarResposta(response.data.resultado);
      setRoteiroGerado(processado);
      
      const creditosResponse = await axios.post(`${API_URL}/api/incrementar-creditos`, {
        usuarioId
      });
      
      setCreditos(creditosResponse.data);
      
    } catch (error) {
      if (error.response) {
        if (error.response.status === 429) {
          setErro('');
          setTempoRestante(86400);
          setMostrarPopup(true);
          
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            setTempoRestante(prev => {
              if (prev <= 1) {
                clearInterval(timerRef.current);
                setMostrarPopup(false);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        } else {
          setErro('Erro: ' + (error.response.data.erro || 'Erro no servidor'));
        }
      } else {
        setErro('Erro de conexão com o servidor');
      }
    } finally {
      setLoading(false);
    }
  };

  const copiarRoteiro = () => {
    if (!roteiroGerado) return;
    const textoCompleto = `${roteiroGerado.titulo}\n\n${roteiroGerado.roteiro.join('\n')}`;
    navigator.clipboard.writeText(textoCompleto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const exportarPDF = async () => {
    if (!resultadoRef.current) return;
    try {
      const canvas = await html2canvas(resultadoRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const width = imgWidth * ratio;
      const height = imgHeight * ratio;
      const x = (pdfWidth - width) / 2;
      pdf.addImage(imgData, 'PNG', x, 10, width, height);
      pdf.save('roteiro.pdf');
    } catch (error) {
      setErro('Erro ao gerar PDF');
    }
  };

  const formatarTempo = (segundos) => {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const segs = segundos % 60;
    return `${horas}h ${minutos}m ${segs}s`;
  };

  return (
    <div className="container">
      <h1>🎬 Gerador de Roteiros</h1>
      
      {/* ========== LOGIN ========== */}
      <div className="login-container">
        {usuario ? (
          <div className="usuario-info">
            <span className="usuario-nome">👤 {usuario}</span>
            <button onClick={fazerLogout} className="btn-logout">
              Sair
            </button>
          </div>
        ) : (
          <button onClick={() => setMostrarLogin(true)} className="btn-login">
            🔐 Entrar / Cadastrar
          </button>
        )}
      </div>

      {/* ========== CONTADOR DE CRÉDITOS ========== */}
      {usuario && (
        <div className="contador-creditos">
          <span>📊 {usuario}, seus créditos hoje: {creditos.usado}/{creditos.limite}</span>
          <span className="restante">({creditos.restante} restantes)</span>
        </div>
      )}

      {/* SE NÃO ESTIVER LOGADO */}
      {!usuario && (
        <div className="aviso-login">
          <p>🔐 Faça login para começar a gerar roteiros!</p>
        </div>
      )}

      {/* POPUP DE LIMITE */}
      {mostrarPopup && (
        <div className="popup-overlay">
          <div className="popup-conteudo">
            <h3>😅 Limite Diário Atingido</h3>
            <p>Você já usou seus 10 roteiros grátis de hoje!</p>
            <p className="cronometro">⏰ Reset em: {formatarTempo(tempoRestante)}</p>
            <button onClick={() => setMostrarPopup(false)}>OK</button>
          </div>
        </div>
      )}

      {/* BOTÃO DE TEMPLATES */}
      <button 
        className="btn-toggle-templates" 
        onClick={() => setMostrarTemplates(!mostrarTemplates)}
      >
        {mostrarTemplates ? '📋 Esconder Templates' : '📋 Mostrar Templates'}
      </button>

      {/* TEMPLATES */}
      {mostrarTemplates && (
        <div className="templates">
          {templates.map((temp, index) => (
            <button key={index} onClick={() => setIdeia(temp.ideia)} className="btn-template">
              {temp.nome}
            </button>
          ))}
        </div>
      )}

      {/* INPUT */}
      <textarea
        value={ideia}
        onChange={(e) => setIdeia(e.target.value)}
        placeholder={usuario ? "Digite sua ideia aqui ou use um template acima..." : "Faça login para começar"}
        rows="4"
        disabled={!usuario}
      />

      {/* CONTROLES */}
      <div className="controles">
        <div>
          <label>Tipo:</label>
          <button 
            onClick={() => setTipoVideo('curto')} 
            className={tipoVideo === 'curto' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Curto (60s)
          </button>
          <button 
            onClick={() => setTipoVideo('longo')} 
            className={tipoVideo === 'longo' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Longo (5+ min)
          </button>
        </div>

        <div>
          <label>Idioma:</label>
          <button 
            onClick={() => setIdiomaRoteiro('portugues')} 
            className={idiomaRoteiro === 'portugues' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Português
          </button>
          <button 
            onClick={() => setIdiomaRoteiro('ingles')} 
            className={idiomaRoteiro === 'ingles' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Inglês
          </button>
          <button 
            onClick={() => setIdiomaRoteiro('espanhol')} 
            className={idiomaRoteiro === 'espanhol' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Espanhol
          </button>
          <button 
            onClick={() => setIdiomaRoteiro('frances')} 
            className={idiomaRoteiro === 'frances' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Francês
          </button>
          <button 
            onClick={() => setIdiomaRoteiro('alemao')} 
            className={idiomaRoteiro === 'alemao' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Alemão
          </button>
          <button 
            onClick={() => setIdiomaRoteiro('italiano')} 
            className={idiomaRoteiro === 'italiano' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Italiano
          </button>
        </div>

        <div>
          <label>Tom:</label>
          <button 
            onClick={() => setTom('normal')} 
            className={tom === 'normal' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Normal
          </button>
          <button 
            onClick={() => setTom('engracado')} 
            className={tom === 'engracado' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Engraçado
          </button>
          <button 
            onClick={() => setTom('serio')} 
            className={tom === 'serio' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Sério
          </button>
          <button 
            onClick={() => setTom('motivacional')} 
            className={tom === 'motivacional' ? 'ativo' : ''}
            disabled={!usuario}
          >
            Motivacional
          </button>
        </div>
      </div>

      {/* BOTÃO GERAR */}
      <button 
        onClick={gerarRoteiro} 
        disabled={loading || !usuario} 
        className="btn-gerar"
      >
        {!usuario ? 'Faça login para gerar' : (loading ? 'Gerando...' : '✨ Gerar Roteiro')}
      </button>

      {erro && <div className="erro">{erro}</div>}

      {/* RESULTADO */}
      {roteiroGerado && (
        <>
          <div className="botoes-acao">
            <button onClick={copiarRoteiro} className="btn-copiar">
              {copiado ? '✅ Copiado!' : '📋 Copiar'}
            </button>
            <button onClick={exportarPDF} className="btn-pdf">
              📥 Exportar PDF
            </button>
          </div>

          <div ref={resultadoRef} className="resultado">
            <h3>{roteiroGerado.titulo}</h3>
            <div className="roteiro">
              {roteiroGerado.roteiro.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </div>
        </>
      )}

      {/* ========== POPUP DE LOGIN/CADASTRO/RECUPERAÇÃO ========== */}
      {mostrarLogin && (
        <div className="popup-overlay" onClick={() => setMostrarLogin(false)}>
          <div className="popup-conteudo" onClick={(e) => e.stopPropagation()}>
            
            {/* TABS - só mostra se não estiver em modo recuperação */}
            {!modoRecuperacao && !mostrarFrase && (
              <div className="login-tabs">
                <button 
                  className={modoLogin === 'login' ? 'tab-ativo' : ''} 
                  onClick={() => setModoLogin('login')}
                >
                  Entrar
                </button>
                <button 
                  className={modoLogin === 'cadastro' ? 'tab-ativo' : ''} 
                  onClick={() => setModoLogin('cadastro')}
                >
                  Cadastrar
                </button>
              </div>
            )}

            {/* ===== TELA DE RECUPERAÇÃO POR FRASE ===== */}
            {modoRecuperacao && (
              <div className="login-form">
                <h3>🔐 Recuperar Senha</h3>
                <p className="aviso-codigo">
                  Digite sua frase de recuperação de 12 palavras e a nova senha.
                </p>
                
                <textarea
                  placeholder="Frase de recuperação (12 palavras)"
                  value={fraseRecuperacao}
                  onChange={(e) => setFraseRecuperacao(e.target.value)}
                  className="login-input"
                  rows="3"
                  style={{ fontFamily: 'monospace' }}
                />
                
                <input
                  type="password"
                  placeholder="Nova senha *"
                  value={novaSenhaRecuperacao}
                  onChange={(e) => setNovaSenhaRecuperacao(e.target.value)}
                  className="login-input"
                />
                
                <input
                  type="password"
                  placeholder="Confirmar nova senha *"
                  value={confirmarNovaSenha}
                  onChange={(e) => setConfirmarNovaSenha(e.target.value)}
                  className="login-input"
                />
                
                {erroLogin && <p className="erro-login">{erroLogin}</p>}
                
                <button 
                  className="btn-login-submit"
                  onClick={handleRecuperarPorFrase}
                >
                  Redefinir Senha
                </button>
                
                <button 
                  className="btn-link"
                  onClick={() => {
                    setModoRecuperacao(false);
                    setErroLogin('');
                  }}
                >
                  ← Voltar ao login
                </button>
              </div>
            )}

            {/* ===== LOGIN ===== */}
            {modoLogin === 'login' && !modoRecuperacao && !mostrarFrase && (
              <div className="login-form">
                <h3>🔐 Entrar</h3>
                
                {mostrarCampoCodigo ? (
                  <>
                    <p className="aviso-codigo">
                      🔑 Dispositivo não reconhecido. Digite seu código de ativação para autorizar.
                    </p>
                    <input
                      type="text"
                      placeholder="Código de ativação"
                      value={codigoDispositivo}
                      onChange={(e) => setCodigoDispositivo(e.target.value)}
                      className="login-input"
                    />
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Nome de usuário"
                      value={formLogin.usuario}
                      onChange={(e) => setFormLogin({ ...formLogin, usuario: e.target.value })}
                      className="login-input"
                    />
                    <input
                      type="password"
                      placeholder="Senha"
                      value={formLogin.senha}
                      onChange={(e) => setFormLogin({ ...formLogin, senha: e.target.value })}
                      className="login-input"
                    />
                  </>
                )}
                
                {erroLogin && <p className="erro-login">{erroLogin}</p>}
                
                <button 
                  className="btn-login-submit"
                  onClick={handleLogin}
                >
                  {mostrarCampoCodigo ? 'Autorizar Dispositivo' : 'Entrar'}
                </button>
                
                {mostrarCampoCodigo && (
                  <button 
                    className="btn-link"
                    onClick={() => {
                      setMostrarCampoCodigo(false);
                      setCodigoDispositivo('');
                      setErroLogin('');
                    }}
                  >
                    ← Voltar
                  </button>
                )}
                
                <button 
                  className="btn-link"
                  onClick={() => {
                    setModoRecuperacao(true);
                    setErroLogin('');
                  }}
                >
                  Esqueceu a senha? Recupere com frase secreta
                </button>
              </div>
            )}

            {/* ===== CADASTRO COM CÓDIGO ===== */}
            {modoLogin === 'cadastro' && !mostrarFrase && (
              <div className="login-form">
                <h3>📝 Criar Conta</h3>
                <p className="aviso-codigo">
                  ⚠️ Você precisa de um código de ativação válido (recebido na compra)
                </p>
                
                <input
                  type="text"
                  placeholder="Código de ativação *"
                  value={formCadastro.codigo}
                  onChange={(e) => setFormCadastro({ ...formCadastro, codigo: e.target.value })}
                  className="login-input"
                />
                
                <input
                  type="text"
                  placeholder="Nome de usuário *"
                  value={formCadastro.usuario}
                  onChange={(e) => setFormCadastro({ ...formCadastro, usuario: e.target.value })}
                  className="login-input"
                />
                
                <input
                  type="email"
                  placeholder="Email (opcional, para recuperação)"
                  value={formCadastro.email}
                  onChange={(e) => setFormCadastro({ ...formCadastro, email: e.target.value })}
                  className="login-input"
                />
                
                <input
                  type="password"
                  placeholder="Senha *"
                  value={formCadastro.senha}
                  onChange={(e) => setFormCadastro({ ...formCadastro, senha: e.target.value })}
                  className="login-input"
                />
                
                <input
                  type="password"
                  placeholder="Confirmar senha *"
                  value={formCadastro.confirmarSenha}
                  onChange={(e) => setFormCadastro({ ...formCadastro, confirmarSenha: e.target.value })}
                  className="login-input"
                />
                
                {erroLogin && <p className="erro-login">{erroLogin}</p>}
                
                <button 
                  className="btn-login-submit"
                  onClick={handleCadastro}
                >
                  Cadastrar e Gerar Frase
                </button>
              </div>
            )}

            {/* ===== TELA DE EXIBIÇÃO DA FRASE GERADA ===== */}
            {mostrarFrase && (
              <div className="login-form">
                <h3>⚠️ SUA FRASE DE RECUPERAÇÃO ÚNICA</h3>
                <div className="frase-texto">
                  {fraseGerada}
                </div>
                <p className="aviso-importante">
                  🔴 <strong>GUARDE ESTA FRASE EM LOCAL SEGURO!</strong>
                </p>
                <p className="aviso-importante">
                  Ela é a única forma de recuperar sua conta se esquecer a senha.
                  Sem ela, não há como recuperar o acesso.
                </p>
                <p className="aviso-importante">
                  ⚠️ Esta frase será mostrada apenas UMA VEZ.
                </p>
                
                <input
                  type="checkbox"
                  id="confirmei"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setMostrarFrase(false);
                      setMostrarLogin(false);
                    }
                  }}
                />
                <label htmlFor="confirmei" style={{ marginLeft: '8px' }}>
                  Confirmo que anotei minha frase em local seguro
                </label>
              </div>
            )}

            <button className="btn-fechar" onClick={() => {
              setMostrarLogin(false);
              setMostrarFrase(false);
              setModoRecuperacao(false);
              setMostrarCampoCodigo(false);
              setCodigoDispositivo('');
            }}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;