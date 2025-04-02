const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato "Bearer TOKEN"

  if (token == null) {
    // Permitir acesso sem token a rotas públicas (se houver), mas marcar como não autenticado
    // Se a rota *exige* autenticação, ela deve retornar 401 se req.user não existir.
    // Ou podemos ter middlewares diferentes para rotas públicas vs protegidas.
    // Por agora, vamos retornar 401 se não houver token, assumindo que este middleware
    // será aplicado apenas a rotas protegidas.
    return res.status(401).json({ message: 'Token de autenticação não fornecido.' });
  }

  const jwtSecret = process.env.JWT_SECRET || 'seu_segredo_jwt_padrao'; // Use a mesma chave secreta
  if (jwtSecret === 'seu_segredo_jwt_padrao') {
    console.warn("AVISO: Usando chave JWT padrão. Defina JWT_SECRET no seu arquivo .env para produção!");
  }


  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) {
      console.error("Erro na verificação do JWT:", err.message);
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ message: 'Token expirado.' }); // Token expirado
      }
      // Não vazar detalhes do erro para o cliente por segurança
      return res.status(403).json({ message: 'Falha na autenticação. Token inválido ou expirado.' }); // Token inválido
    }
    req.user = user; // Adiciona informações do usuário decodificado à requisição (ex: { username: 'admin', iat: ..., exp: ... })
    next(); // Passa para a próxima função de middleware ou rota
  });
};

module.exports = authenticateToken;