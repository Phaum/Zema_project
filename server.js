import express from 'express';

const app = express() 
const PORT = 3000

app.use(express.json());

//Профиль пользователя
app.get('/api/profile', (req, res) => {
    const userProfile = {
      id: 1,
      userName: "Алексей",
      email: "alex@example.com"
    }

    res.json({
        success: true,
        message: `Профиль пользователя ${userProfile.userName} успешно загружен`,
        data: userProfile
    })

})

//Список проектов
app.get('/api/projects', (req, res) => {
    const projects = []

    res.json({
        success: true,
        message: 'Список проектов успешно загружен',
        data: projects
    })
})

//Данные проекта
app.get('/api/projects/:id', (req, res) => {
    const dataProject = [
    ]

    const projectId = parseInt(req.params.id, 10)

    const project = dataProject.find(project => project.id === projectId)
    
    if (project) {
        return res.json({
        success:true,
        message: `Проект "${project.name} загружен"`,
        data: project
    })
    }
    return res.status(404).json({ success: false, message: 'Проект не найден' })
})

// Результаты и аналоги
app.get('/api/projects/:id/results', (req, res) => {

    const projectId = parseInt(req.params.id, 10);

    const resultsData = {
        1: {
            projectId: 1,
            projectName: 'Оценка Бц1',

            mainResults: {

            },

             analogs: [

            ],

        },

        2: {
            projectId: 2,
            projectName: 'Оценка Бц2',

            mainResults: {

            },

             analogs: [

             ],

        }
    }

    if(!resultsData[projectId]) {
        return res.status(404).json({ success: false, message: 'Проект не найден' });
    }

    res.json({
        success:true,
        message: `Результаты ${resultsData[projectId].projectName} загружены`,
        data: resultsData[projectId]
    })
})

// Данные для тепловых карт
app.get('/api/analytics/heatmaps', (req, res) => {

    const heatmapData = {

    }

    res.json({
        success: true,
        message: 'Данные тепловой карты успешно загружены',
        data: heatmapData
    })
    
})

// Сдои карты
app.get('/api/geo/layers', (req, res) => {
    const geoLayers = {

    }

    res.json({
        success: true,
        message: 'Слои карты успешно загружены',
        data: geoLayers
    })
})


// Справочники
app.get('/api/reference/:type', (req, res) => {

    const references = {

    }

    res.json({
        success: true,
        message: 'Справочники успешно загружены', 
        data: references
    })
})

// Регистрация
app.post('/api/auth/register', (req, res) => {

    const userData = {
        id: 1,
        email: req.body.email,
        password: req.body.password
    }

    res.json({
        success: true,
        message: 'Регистрация успешно выполнена',
        userData
    })

})

// Вход
app.post('/api/auth/login', (req, res) => {

    const userData = {
        id:1,
        email: req.body.email,
        password: req.body.password
    }

        res.json({
        success: true,
        message: 'Вход успешно выполнен',
        userData
    })
})

// Создать проект
app.post('/api/projects', (req, res) => {
    const projects = {
        id: 1,
        name: req.body.name,
        address: req.body.address,
        status: req.body.status,
        date: req.body.date,
        estimatedValue: req.body.estimatedValue
    }

    res.json({
        success: true,
        message: 'Проект успешно создан',
        projects
    })
})

// Сохр/обнов ввод
app.post('/api/projects/:id/inputs', (req, res) => {

    const projectId = parseInt(req.params.id, 10)
    const inputData = req.body

    res.json({
        success: true,
        message: `Ввод для проекта ${projectId} успешно сохранен`,
        projectId: projectId,
        inputData: inputData
    })
})

// Запуск рассчета
app.post('/api/projects/:id/run', (req, res) => {

    const projectId = parseInt(req.params.id, 10)
    const runData = req.body

    res.json({
        success: true,
        message: `Рассчет для проекта ${projectId} успешно запущен`,
        projectId: projectId,
        runData: runData
    })
})

app.post('/api/admin/import', (req, res) => {

    res.json({
        success: true,
        message: 'Данные импортированы',
        importData: req.body
    })
})

app.post('/api/admin/reference/:type', (req, res) => {
    const referenceType = req.params.type
    const action = req.body.action

    res.json({
        success: true,
        message: `Справочник ${referenceType} обновлен`,
        action: action,
        type: referenceType
    })
})


app.use((req, res) => {
    res.status(404).json({success: false, message: 'Не найдено'})
})

app.listen(PORT, () => {
    console.log(`Сервер успешно запущен на http://localhost:${PORT}`)
})
