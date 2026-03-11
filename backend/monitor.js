const fs = require('fs');
const path = require('path');

class MonitorGroq {
  constructor() {
    this.logFile = path.join(__dirname, 'uso_groq.log');
    this.usoDiario = {};
    this.carregarUso();
  }

  carregarUso() {
    try {
      if (fs.existsSync(this.logFile)) {
        const data = fs.readFileSync(this.logFile, 'utf8');
        this.usoDiario = JSON.parse(data);
      }
    } catch (error) {
      console.error('Erro ao carregar log:', error);
    }
  }

  salvarUso() {
    try {
      fs.writeFileSync(this.logFile, JSON.stringify(this.usoDiario, null, 2));
    } catch (error) {
      console.error('Erro ao salvar log:', error);
    }
  }

  registrarUso(chaveIndex) {
    const hoje = new Date().toISOString().split('T')[0];
    
    if (!this.usoDiario[hoje]) {
      this.usoDiario[hoje] = { total: 0, porChave: {} };
    }
    
    this.usoDiario[hoje].total++;
    this.usoDiario[hoje].porChave[chaveIndex] = (this.usoDiario[hoje].porChave[chaveIndex] || 0) + 1;
    
    this.salvarUso();
    
    // Alertar se estiver perto do limite
    if (this.usoDiario[hoje].total > 900) {
      console.log('⚠️ ALERTA: Uso próximo do limite diário!');
    }
  }

  getResumo() {
    const hoje = new Date().toISOString().split('T')[0];
    const usoHoje = this.usoDiario[hoje] || { total: 0, porChave: {} };
    
    return {
      total: usoHoje.total,
      limite: 1000,
      restante: 1000 - usoHoje.total,
      porChave: usoHoje.porChave
    };
  }
}

module.exports = new MonitorGroq();