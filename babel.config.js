module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        // include: ['transform-arrow-functions'],
        modules: false,
        targets: {
          browsers: [
            '>3%',
            'not dead',
            'defaults',
            'not ie 11',
            'not op_mini all'
          ]
        }
      }
    ]
  ]
}
