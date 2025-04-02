// backend/routes/forwards.js
const express = require('express');
const router = express.Router();
const forwardService = require('../services/forwardService');
const authenticateToken = require('../middleware/auth'); // Importa o middleware

// Aplicar o middleware de autenticação a todas as rotas neste arquivo
router.use(authenticateToken);

// GET /api/forwards - Listar todos os forwards (versão simplificada)
router.get('/', async (req, res) => {
  try {
    const forwards = await forwardService.getAll();
    res.json(forwards);
  } catch (error) {
    console.error("Erro em GET /api/forwards:", error);
    res.status(500).json({ message: String(error) || "Erro ao buscar forwards." });
  }
});

// GET /api/forwards/:id - Obter um forward específico
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido." });
    }
    const forward = await forwardService.getById(id);
    if (forward) {
      res.json(forward);
    } else {
      // O serviço agora resolve com null se não encontrado
      res.status(404).json({ message: `Forward com ID ${id} não encontrado.` });
    }
  } catch (error) {
     console.error(`Erro em GET /api/forwards/${req.params.id}:`, error);
     res.status(500).json({ message: String(error) || "Erro ao buscar forward por ID." });
  }
});

// POST /api/forwards - Criar um novo forward
router.post('/', async (req, res) => {
  try {
    const newForwardData = req.body;
    // Validação básica dos dados recebidos pode ser feita aqui antes de chamar o serviço
    if (!newForwardData.nome || !newForwardData.url_destino || !newForwardData.metodo) {
       return res.status(400).json({ message: "Campos obrigatórios (nome, url_destino, metodo) não fornecidos no corpo da requisição." });
    }
    const createdForward = await forwardService.create(newForwardData);
    res.status(201).json(createdForward);
  } catch (error) {
    console.error("Erro em POST /api/forwards:", error);
    // Verifica se o erro é de nome duplicado ou validação
    if (typeof error === 'string' && (error.includes('já está em uso') || error.includes('UNIQUE constraint failed'))) {
        res.status(409).json({ message: error }); // 409 Conflict
    } else if (typeof error === 'string' && error.includes('obrigatórios')) {
        res.status(400).json({ message: error }); // Bad Request
    }
    else {
        res.status(500).json({ message: String(error) || "Erro ao criar forward." });
    }
  }
});

// PUT /api/forwards/:id - Atualizar um forward existente
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
     if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido." });
    }
    const updatedData = req.body;
    const updatedForward = await forwardService.update(id, updatedData);
    if (updatedForward) {
      res.json(updatedForward);
    } else {
       // O serviço agora resolve com null se o ID não for encontrado
      res.status(404).json({ message: `Forward com ID ${id} não encontrado para atualização.` });
    }
  } catch (error) {
    console.error(`Erro em PUT /api/forwards/${req.params.id}:`, error);
     if (typeof error === 'string' && (error.includes('já está em uso') || error.includes('UNIQUE constraint failed'))) {
        res.status(409).json({ message: error }); // 409 Conflict
     } else if (typeof error === 'string' && error.includes('Nenhum campo')) {
         res.status(400).json({ message: error }); // Bad Request
     }
     else {
        res.status(500).json({ message: String(error) || "Erro ao atualizar forward." });
     }
  }
});

// DELETE /api/forwards/:id - Deletar um forward
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
     if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido." });
    }
    const result = await forwardService.delete(id);
     if (result) {
        res.json(result); // Retorna a mensagem de sucesso e o ID deletado
        // Ou res.status(204).send(); // No Content
     } else {
         // O serviço agora resolve com null se o ID não for encontrado
         res.status(404).json({ message: `Forward com ID ${id} não encontrado para deleção.` });
     }
  } catch (error) {
    console.error(`Erro em DELETE /api/forwards/${req.params.id}:`, error);
    res.status(500).json({ message: String(error) || "Erro ao deletar forward." });
  }
});

module.exports = router;